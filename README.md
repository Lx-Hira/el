# shrnk — self-hosted URL shortener + QR generator

A real, working Flask backend (not a demo) behind the same front-end you already saw:
short links, per-link QR customization, password/one-time/expiring links, a smart
redirect engine, and an admin panel — all backed by a SQLite database, so data
survives restarts and every visitor sees the same data.

## What's real here

- Signup/login (email + password, hashed with Werkzeug's `generate_password_hash`)
- Anonymous visitors get their own dashboard too (via a secure session cookie),
  and their links get folded into their account automatically if they later sign up
- Real short-link redirects at `yourdomain.com/<alias>` — actually redirects, tracks clicks
- Password-protected, one-time-use, and 24h-expiring links, enforced server-side
- Smart redirect engine: every Nth visitor gets sent to a rotating destination
  (sequential or random), fully configurable from `/admin`
- `/sitemap.xml` and `/robots.txt` for Google indexing
- Admin panel gated behind a real `is_admin` flag in the database

## What's still simplified (be aware before going fully "production")

- No email verification / password-reset emails (needs an SMTP or transactional
  email provider — SendGrid, Postmark, etc. — wired into `/api/auth/*`)
- No Google/GitHub OAuth login yet (needs API keys from those providers)
- Analytics are basic (clicks only) — country/device/browser breakdowns would
  need a geolocation lookup and user-agent parsing library
- Uses Flask's built-in dev server when run directly — fine for testing,
  swap in Gunicorn/uWSGI for real traffic (instructions below)
- SQLite is great up to moderate traffic; move to Postgres if you expect heavy concurrent writes

## Running it locally

```bash
cd shrnk
pip install -r requirements.txt --break-system-packages   # just Flask — everything else is stdlib
python3 app.py
```

Visit `http://127.0.0.1:5000`. A default admin account is created automatically:

- **email:** `admin@easylink.com`
- **password:** `10596LX@`

**Log in as that account and change the password immediately** (or edit it directly
in `shrnk.db` before you ever expose this publicly) — reset via the admin panel's
"reset password" button, or drop `shrnk.db` and re-seed with your own credentials.

## Putting it on your own domain

You have a few solid options, roughly easiest → most control:

1. **Render.com / Railway.app** (easiest): push this folder to a GitHub repo,
   connect it, set the start command to `gunicorn app:app`, add
   `gunicorn` to `requirements.txt`, and point your domain's DNS (CNAME) at
   the platform's provided address. Both have free/cheap tiers.
2. **PythonAnywhere**: upload the folder, set up a WSGI app pointing at `app.app`,
   add your custom domain in their dashboard.
3. **Your own VPS** (DigitalOcean, Hetzner, etc.): install Python, run this behind
   Gunicorn + Nginx, point an A record at the server's IP, and use `certbot` for
   free HTTPS.

Whichever you pick, set a real `SHRNK_SECRET_KEY` environment variable (a long
random string) instead of relying on the auto-generated one — otherwise everyone's
login session resets whenever the server restarts.

```bash
export SHRNK_SECRET_KEY="paste-a-long-random-string-here"
```

For production, run it via Gunicorn instead of `python3 app.py`:

```bash
pip install gunicorn --break-system-packages
gunicorn -w 4 -b 0.0.0.0:8000 app:app
```

## File map

```
app.py               Flask routes: auth, links, redirects, admin API, SEO
db.py                SQLite schema + connection helper
templates/index.html Single-page frontend (home / dashboard / admin)
templates/message.html, password_gate.html   Small server-rendered pages for link states
static/style.css     Design system
static/app.js        All frontend logic, talks to the backend via fetch()
requirements.txt     Just Flask
```
