/* ================= GLOBAL STATE ================= */
let authState = { loggedIn: false, email: null, isAdmin: false };
const qrOptions = { fg:'#0B0E17', bg:'#ffffff', transparent:false, style:'square', frame:'none', size:280, logo:null, customLogoData:null };
let currentQRTarget = window.location.origin + '/a1B2';

const BUILTIN_LOGOS = [
  {id:'youtube', label:'YT', color:'#FF0000'}, {id:'whatsapp', label:'WA', color:'#25D366'},
  {id:'instagram', label:'IG', color:'#C13584'}, {id:'facebook', label:'FB', color:'#1877F2'},
  {id:'telegram', label:'TG', color:'#0088CC'}, {id:'tiktok', label:'TT', color:'#000000'},
  {id:'x', label:'X', color:'#000000'}, {id:'linkedin', label:'IN', color:'#0A66C2'},
  {id:'github', label:'GH', color:'#181717'}, {id:'discord', label:'DC', color:'#5865F2'},
  {id:'gmail', label:'GM', color:'#EA4335'}, {id:'spotify', label:'SP', color:'#1DB954'},
];

/* ================= API HELPER ================= */
async function api(path, opts={}){
  const res = await fetch(path, {
    method: opts.method || 'GET',
    headers: opts.body ? {'Content-Type':'application/json'} : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  let data = null;
  try{ data = await res.json(); }catch(e){}
  if(!res.ok){ throw new Error((data && data.error) || 'Something went wrong'); }
  return data;
}

function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(()=>t.classList.remove('show'), 2800);
}

/* ================= NAV / PAGES ================= */
function switchPage(page){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-'+page).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active', b.dataset.page===page));
  if(page==='dashboard') renderDashboard();
  if(page==='admin') renderAdmin();
  window.scrollTo({top:0, behavior:'instant'});
}
document.querySelectorAll('.nav-btn').forEach(b=>b.addEventListener('click',()=>switchPage(b.dataset.page)));

document.getElementById('themeToggle').addEventListener('click', ()=>{
  const html = document.documentElement;
  html.dataset.theme = html.dataset.theme==='dark' ? 'light' : 'dark';
});

/* ================= AUTH ================= */
const authArea = document.getElementById('authArea');
const authModalBackdrop = document.getElementById('authModalBackdrop');
let authMode = 'login';

function renderAuthArea(){
  if(authState.loggedIn){
    authArea.innerHTML = `
      <span style="font-size:13px; color:var(--text-dim); margin-right:8px;">${authState.email}</span>
      <button class="btn btn-ghost btn-sm" id="logoutBtn">Log out</button>`;
    document.getElementById('logoutBtn').addEventListener('click', async ()=>{
      await api('/api/auth/logout', {method:'POST'});
      authState = { loggedIn:false, email:null, isAdmin:false };
      renderAuthArea();
      showToast('Logged out');
      switchPage('home');
    });
  } else {
    authArea.innerHTML = `
      <button class="btn btn-ghost btn-sm" id="loginBtn">Log in</button>
      <button class="btn btn-primary btn-sm" id="signupBtn">Get started</button>`;
    document.getElementById('loginBtn').addEventListener('click', ()=>openAuthModal('login'));
    document.getElementById('signupBtn').addEventListener('click', ()=>openAuthModal('signup'));
  }
  document.getElementById('adminNavBtn').style.display = authState.isAdmin ? 'inline-block' : 'none';
}

function openAuthModal(mode){
  authMode = mode;
  document.getElementById('authModalTitle').textContent = mode==='login' ? 'Log in' : 'Create your account';
  document.getElementById('authSubmitBtn').textContent = mode==='login' ? 'Log in' : 'Sign up';
  document.getElementById('authSwitchMode').textContent = mode==='login' ? 'Need an account? Sign up' : 'Already have an account? Log in';
  document.getElementById('authError').style.display = 'none';
  document.getElementById('authEmail').value = '';
  document.getElementById('authPassword').value = '';
  authModalBackdrop.style.display = 'flex';
}
document.getElementById('authCloseBtn').addEventListener('click', ()=> authModalBackdrop.style.display='none');
document.getElementById('authSwitchMode').addEventListener('click', (e)=>{ e.preventDefault(); openAuthModal(authMode==='login'?'signup':'login'); });

document.getElementById('authSubmitBtn').addEventListener('click', async ()=>{
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const errEl = document.getElementById('authError');
  try{
    const path = authMode==='login' ? '/api/auth/login' : '/api/auth/signup';
    const data = await api(path, {method:'POST', body:{email, password}});
    authState = { loggedIn:true, email:data.email, isAdmin:data.isAdmin };
    renderAuthArea();
    authModalBackdrop.style.display = 'none';
    showToast(authMode==='login' ? 'Welcome back' : 'Account created');
  }catch(e){
    errEl.textContent = e.message; errEl.style.display='block';
  }
});

async function loadAuthState(){
  const data = await api('/api/auth/me');
  authState = { loggedIn: data.loggedIn, email: data.email, isAdmin: !!data.isAdmin };
  renderAuthArea();
}

/* ================= HERO ================= */
(function heroAnim(){
  const el = document.getElementById('shrinkChars');
  const full = "https://www.example.com/products/summer-collection/2026?ref=newsletter";
  let dir = -1, i = full.length;
  setInterval(()=>{
    i += dir;
    if(i <= 12){ dir = 1; }
    if(i >= full.length){ dir = -1; }
    el.textContent = full.slice(0, i) + (i<full.length ? '…' : '');
  }, 90);
})();
document.getElementById('shrinkTarget').textContent = window.location.host + '/a1B2';
document.getElementById('heroCaption').textContent = window.location.host + '/a1B2 · scans live';

document.querySelectorAll('.faq-q').forEach(q=>{
  q.addEventListener('click', ()=> q.parentElement.classList.toggle('open'));
});

/* ================= QR RENDERING ================= */
function makeQrMatrix(text){
  const qr = qrcode(0, 'H');
  qr.addData(text);
  qr.make();
  return qr;
}
function roundRect(ctx,x,y,w,h,r){
  ctx.beginPath(); ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
}
function drawQR(canvas, text, opts){
  const qr = makeQrMatrix(text || (window.location.origin+'/a1B2'));
  const count = qr.getModuleCount();
  const size = opts.size || 280;
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,size,size);
  const margin = 2;
  const cell = size / (count + margin*2);
  if(!opts.transparent){ ctx.fillStyle = opts.bg; ctx.fillRect(0,0,size,size); }
  ctx.fillStyle = opts.fg;
  const logoOn = !!opts.logo || !!opts.customLogoData;
  const skipStart = Math.floor(count*0.38), skipEnd = Math.ceil(count*0.62);
  for(let r=0;r<count;r++){
    for(let c=0;c<count;c++){
      if(!qr.isDark(r,c)) continue;
      if(logoOn && r>=skipStart && r<=skipEnd && c>=skipStart && c<=skipEnd) continue;
      const x = (c+margin)*cell, y = (r+margin)*cell;
      if(opts.style==='dots'){ ctx.beginPath(); ctx.arc(x+cell/2, y+cell/2, cell*0.42, 0, Math.PI*2); ctx.fill(); }
      else if(opts.style==='rounded'){ roundRect(ctx, x+cell*0.08, y+cell*0.08, cell*0.84, cell*0.84, cell*0.28); ctx.fill(); }
      else { ctx.fillRect(x, y, cell*0.98, cell*0.98); }
    }
  }
  if(opts.frame==='scan'){
    ctx.fillStyle = opts.fg; ctx.font = `600 ${size*0.055}px Inter, sans-serif`; ctx.textAlign = 'center';
    ctx.fillText('SCAN ME', size/2, size - size*0.02);
  }
  if(logoOn){
    const lsize = size*0.24, lx = size/2 - lsize/2, ly = size/2 - lsize/2;
    ctx.fillStyle = '#ffffff'; roundRect(ctx, lx-6, ly-6, lsize+12, lsize+12, 12); ctx.fill();
    if(opts.customLogoData){
      const img = new Image();
      img.onload = ()=> ctx.drawImage(img, lx, ly, lsize, lsize);
      img.src = opts.customLogoData;
    } else if(opts.logo){
      const b = BUILTIN_LOGOS.find(l=>l.id===opts.logo);
      if(b){
        ctx.fillStyle = b.color; roundRect(ctx, lx, ly, lsize, lsize, 10); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = `700 ${lsize*0.32}px Inter, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(b.label, lx+lsize/2, ly+lsize/2+1);
      }
    }
  }
}
function renderMiniQR(container, text){
  container.innerHTML = '';
  const c = document.createElement('canvas');
  container.appendChild(c);
  drawQR(c, text, {fg:'#0B0E17', bg:'#ffffff', transparent:false, style:'square', frame:'none', size:64, logo:null});
}
renderMiniQR(document.getElementById('heroQR'), window.location.origin+'/a1B2');

function renderCustomizerQR(){ drawQR(document.getElementById('qrCanvas'), currentQRTarget, qrOptions); }
renderCustomizerQR();

document.getElementById('fgColor').addEventListener('input', e=>{ qrOptions.fg = e.target.value; renderCustomizerQR(); });
document.getElementById('bgColor').addEventListener('input', e=>{ qrOptions.bg = e.target.value; renderCustomizerQR(); });
document.getElementById('transparentBg').addEventListener('change', e=>{ qrOptions.transparent = e.target.checked; renderCustomizerQR(); });
document.getElementById('sizeRange').addEventListener('input', e=>{
  qrOptions.size = parseInt(e.target.value,10);
  document.getElementById('sizeLabel').textContent = qrOptions.size+'px';
  renderCustomizerQR();
});
document.getElementById('styleSeg').addEventListener('click', e=>{
  const btn = e.target.closest('button'); if(!btn) return;
  [...btn.parentElement.children].forEach(b=>b.classList.remove('active')); btn.classList.add('active');
  qrOptions.style = btn.dataset.style; renderCustomizerQR();
});
document.getElementById('frameSeg').addEventListener('click', e=>{
  const btn = e.target.closest('button'); if(!btn) return;
  [...btn.parentElement.children].forEach(b=>b.classList.remove('active')); btn.classList.add('active');
  qrOptions.frame = btn.dataset.frame; renderCustomizerQR();
});

const logoGrid = document.getElementById('logoGrid');
function selectLogoUI(activeEl){ logoGrid.querySelectorAll('.logo-pick').forEach(e=>e.classList.remove('active')); activeEl.classList.add('active'); }
(function buildLogoGrid(){
  const noneEl = document.createElement('div');
  noneEl.className = 'logo-pick none-pick active'; noneEl.textContent = 'None';
  noneEl.addEventListener('click', ()=>{ qrOptions.logo=null; qrOptions.customLogoData=null; selectLogoUI(noneEl); renderCustomizerQR(); });
  logoGrid.appendChild(noneEl);
  BUILTIN_LOGOS.forEach(l=>{
    const el = document.createElement('div');
    el.className = 'logo-pick'; el.style.background = l.color; el.textContent = l.label;
    el.addEventListener('click', ()=>{ qrOptions.logo=l.id; qrOptions.customLogoData=null; selectLogoUI(el); renderCustomizerQR(); });
    logoGrid.appendChild(el);
  });
})();
document.getElementById('customLogoUpload').addEventListener('change', e=>{
  const file = e.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = ev=>{
    qrOptions.customLogoData = ev.target.result; qrOptions.logo = null;
    logoGrid.querySelectorAll('.logo-pick').forEach(el=>el.classList.remove('active'));
    renderCustomizerQR();
  };
  reader.readAsDataURL(file);
});

function buildQRSvg(text, opts){
  const qr = makeQrMatrix(text);
  const count = qr.getModuleCount();
  const size = opts.size, margin=2, cell = size/(count+margin*2);
  let shapes = '';
  const logoOn = !!opts.logo || !!opts.customLogoData;
  const skipStart = Math.floor(count*0.38), skipEnd = Math.ceil(count*0.62);
  for(let r=0;r<count;r++){
    for(let c2=0;c2<count;c2++){
      if(!qr.isDark(r,c2)) continue;
      if(logoOn && r>=skipStart && r<=skipEnd && c2>=skipStart && c2<=skipEnd) continue;
      const x=(c2+margin)*cell, y=(r+margin)*cell;
      if(opts.style==='dots') shapes += `<circle cx="${x+cell/2}" cy="${y+cell/2}" r="${cell*0.42}" fill="${opts.fg}"/>`;
      else if(opts.style==='rounded') shapes += `<rect x="${x+cell*0.08}" y="${y+cell*0.08}" width="${cell*0.84}" height="${cell*0.84}" rx="${cell*0.28}" fill="${opts.fg}"/>`;
      else shapes += `<rect x="${x}" y="${y}" width="${cell*0.98}" height="${cell*0.98}" fill="${opts.fg}"/>`;
    }
  }
  const bg = opts.transparent ? '' : `<rect width="${size}" height="${size}" fill="${opts.bg}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${bg}${shapes}</svg>`;
}

document.getElementById('dlPng').addEventListener('click', ()=>{
  const c = document.getElementById('qrCanvas');
  const a = document.createElement('a'); a.download = 'qrcode.png'; a.href = c.toDataURL('image/png'); a.click();
});
document.getElementById('dlSvg').addEventListener('click', ()=>{
  const svg = buildQRSvg(currentQRTarget, qrOptions);
  const blob = new Blob([svg], {type:'image/svg+xml'});
  const a = document.createElement('a'); a.download = 'qrcode.svg'; a.href = URL.createObjectURL(blob); a.click();
});
document.getElementById('dlPdf').addEventListener('click', ()=>{
  const c = document.getElementById('qrCanvas');
  const w = window.open('', '_blank');
  w.document.write(`<html><head><title>QR Code</title></head><body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;"><img src="${c.toDataURL('image/png')}" style="max-width:80%;"><scr`+`ipt>window.print();</scr`+`ipt></body></html>`);
});
document.getElementById('printQr').addEventListener('click', ()=>{
  const c = document.getElementById('qrCanvas');
  const w = window.open('', '_blank');
  w.document.write(`<html><body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;"><img src="${c.toDataURL('image/png')}"><scr`+`ipt>window.print();</scr`+`ipt></body></html>`);
});
document.getElementById('copyQrImg').addEventListener('click', ()=>{
  try{
    document.getElementById('qrCanvas').toBlob(async blob=>{
      await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);
      showToast('QR image copied');
    });
  }catch(e){ showToast('Copy not supported in this browser'); }
});

/* ================= SHORTENER ================= */
document.getElementById('generateBtn').addEventListener('click', async ()=>{
  const input = document.getElementById('longUrlInput');
  const errEl = document.getElementById('shortenError');
  errEl.style.display = 'none';
  const url = input.value.trim();
  if(!url){ showToast('Paste a URL first'); return; }

  try{
    const link = await api('/api/links', {method:'POST', body:{
      original_url: url,
      alias: document.getElementById('customAlias').value.trim(),
      password: document.getElementById('linkPassword').value,
      one_time: document.getElementById('optOneTime').checked,
      expires: document.getElementById('optExpire').checked,
      utm_source: document.getElementById('utmSource').value.trim(),
    }});

    document.getElementById('resultShortUrl').textContent = link.shortUrl.replace(/^https?:\/\//,'');
    document.getElementById('resultOrigUrl').textContent = link.original;
    document.getElementById('resultCard').classList.add('show');
    renderMiniQR(document.getElementById('resultMiniQR'), link.shortUrl);

    currentQRTarget = link.shortUrl;
    renderCustomizerQR();

    input.value=''; document.getElementById('customAlias').value=''; document.getElementById('linkPassword').value=''; document.getElementById('utmSource').value='';
    showToast('Short link created');
  }catch(e){
    errEl.textContent = e.message; errEl.style.display = 'block';
  }
});
document.getElementById('copyResultBtn').addEventListener('click', ()=>{
  const txt = document.getElementById('resultShortUrl').textContent;
  navigator.clipboard.writeText(window.location.origin + '/' + txt.split('/').pop()).then(()=>showToast('Copied to clipboard'));
});
document.getElementById('customizeResultBtn').addEventListener('click', ()=>{
  document.getElementById('qrCustomizerSection').scrollIntoView({behavior:'smooth'});
});

/* ================= DASHBOARD ================= */
let cachedLinks = [];
async function renderDashboard(){
  cachedLinks = await api('/api/links');
  applyDashboardFilters();
}
function applyDashboardFilters(){
  const tbody = document.getElementById('linksTableBody');
  const empty = document.getElementById('dashEmpty');
  const search = document.getElementById('dashSearch').value.toLowerCase();
  const filter = document.getElementById('dashFilter').value;
  const sort = document.getElementById('dashSort').value;

  let list = cachedLinks.filter(l=>{
    if(search && !l.alias.toLowerCase().includes(search) && !l.original.toLowerCase().includes(search)) return false;
    if(filter==='favorite' && !l.favorite) return false;
    if(filter==='protected' && !l.passwordProtected) return false;
    if(filter==='expiring' && !l.expiresAt) return false;
    return true;
  });
  if(sort==='clicks') list = [...list].sort((a,b)=>b.clicks-a.clicks);
  if(sort==='alpha') list = [...list].sort((a,b)=>a.alias.localeCompare(b.alias));

  tbody.innerHTML = '';
  empty.style.display = list.length ? 'none' : 'block';

  list.forEach(l=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="link-cell"><div class="short">${l.shortUrl.replace(/^https?:\/\//,'')}</div><div class="orig">${l.original}</div></td>
      <td>${l.clicks}</td>
      <td><div class="mini-qr" style="width:40px;height:40px;" id="dashqr-${l.id}"></div></td>
      <td>
        ${l.favorite?'<span class="badge active">★ Favorite</span> ':''}
        ${l.passwordProtected?'<span class="badge">Locked</span> ':''}
        ${l.oneTime?'<span class="badge">One-time</span> ':''}
        ${l.expiresAt?'<span class="badge">Expiring</span>':''}
        ${!l.favorite && !l.passwordProtected && !l.oneTime && !l.expiresAt?'<span class="badge active">Active</span>':''}
      </td>
      <td class="mono" style="font-size:12px; color:var(--text-faint);">${new Date(l.createdAt).toLocaleDateString()}</td>
      <td>
        <div class="row-actions">
          <button title="Favorite" onclick="toggleFavorite(${l.id})">★</button>
          <button title="Copy" onclick="copyLink('${l.shortUrl}')">⧉</button>
          <button title="Delete" onclick="deleteLink(${l.id})">✕</button>
        </div>
      </td>`;
    tbody.appendChild(tr);
    setTimeout(()=>{ const holder = document.getElementById('dashqr-'+l.id); if(holder) renderMiniQR(holder, l.shortUrl); }, 0);
  });

  document.getElementById('dashTotalLinks').textContent = cachedLinks.length;
  document.getElementById('dashTotalClicks').textContent = cachedLinks.reduce((s,l)=>s+l.clicks,0);
  document.getElementById('dashFavCount').textContent = cachedLinks.filter(l=>l.favorite).length;
  document.getElementById('dashActiveCount').textContent = cachedLinks.filter(l=>!l.disabled).length;
}
async function toggleFavorite(id){
  const l = cachedLinks.find(x=>x.id===id);
  await api(`/api/links/${id}`, {method:'PATCH', body:{favorite: !l.favorite}});
  renderDashboard();
}
function copyLink(shortUrl){ navigator.clipboard.writeText(shortUrl).then(()=>showToast('Copied to clipboard')); }
async function deleteLink(id){
  await api(`/api/links/${id}`, {method:'DELETE'});
  showToast('Link deleted');
  renderDashboard();
}
['dashSearch','dashFilter','dashSort'].forEach(id=>{
  document.getElementById(id).addEventListener('input', applyDashboardFilters);
  document.getElementById(id).addEventListener('change', applyDashboardFilters);
});
document.getElementById('exportCsvBtn').addEventListener('click', ()=>{
  if(!cachedLinks.length){ showToast('No links to export'); return; }
  let csv = 'Short URL,Original URL,Clicks,Favorite,Created\n';
  cachedLinks.forEach(l=>{ csv += `"${l.shortUrl}","${l.original}",${l.clicks},${l.favorite},"${l.createdAt}"\n`; });
  const blob = new Blob([csv], {type:'text/csv'});
  const a = document.createElement('a'); a.download = 'links-export.csv'; a.href = URL.createObjectURL(blob); a.click();
  showToast('CSV exported');
});

/* ================= ADMIN ================= */
document.querySelectorAll('.admin-tab-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.admin-tab-btn').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.admin-tab').forEach(t=>t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('admin-'+btn.dataset.tab).classList.add('active');
  });
});

async function renderAdmin(){
  if(!authState.isAdmin){
    document.getElementById('adminGate').style.display = 'block';
    document.getElementById('adminLayout').style.display = 'none';
    return;
  }
  document.getElementById('adminGate').style.display = 'none';
  document.getElementById('adminLayout').style.display = 'grid';

  const overview = await api('/api/admin/overview');
  document.getElementById('adminTotalUsers').textContent = overview.users;
  document.getElementById('adminTotalLinks').textContent = overview.links;
  document.getElementById('adminTotalClicks').textContent = overview.clicks;

  const users = await api('/api/admin/users');
  document.getElementById('adminUsersBody').innerHTML = users.map(u=>`
    <tr><td>${u.email}</td><td>${u.link_count}</td>
    <td><span class="badge ${!u.is_suspended?'active':''}">${u.is_suspended?'Suspended':'Active'}</span></td>
    <td><div class="row-actions">
      <button title="${u.is_suspended?'Unsuspend':'Suspend'}" onclick="toggleSuspend(${u.id}, ${u.is_suspended})">${u.is_suspended?'▶':'⏸'}</button>
      <button title="Reset password" onclick="resetPassword(${u.id})">⟳</button>
    </div></td></tr>`).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--text-dim);padding:20px;">No users yet.</td></tr>';

  const links = await api('/api/admin/links');
  document.getElementById('adminLinksBody').innerHTML = links.map(l=>`
    <tr><td class="link-cell"><div class="short">${l.shortUrl.replace(/^https?:\/\//,'')}</div><div class="orig">${l.original}</div></td>
    <td>${l.clicks}</td>
    <td><div class="row-actions"><button onclick="adminDeleteLink(${l.id})">✕</button></div></td></tr>`).join('')
    || '<tr><td colspan="3" style="text-align:center;color:var(--text-dim);padding:20px;">No links created yet.</td></tr>';

  const rd = await api('/api/admin/redirect');
  const cfg = rd.config;
  document.getElementById('redirectEnableSwitch').classList.toggle('on', !!cfg.enabled);
  document.getElementById('redirectInterval').value = cfg.interval;
  document.getElementById('redirectIntervalLabel').textContent = cfg.interval;
  document.querySelectorAll('#rotationSeg button').forEach(b=>b.classList.toggle('active', b.dataset.mode===cfg.mode));
  renderRedirectUrls(rd.urls);

  const posts = await api('/api/admin/blog');
  document.getElementById('blogPostList').innerHTML = posts.map(p=>`<div class="redirect-list-item"><span>${p.title}</span><span style="color:var(--text-faint); font-size:11px;">${p.created_at.slice(0,10)}</span></div>`).join('') || '<div style="font-size:12.5px;color:var(--text-faint);">No posts yet.</div>';
}

async function toggleSuspend(id, currentlySuspended){
  await api(`/api/admin/users/${id}`, {method:'PATCH', body:{is_suspended: !currentlySuspended}});
  renderAdmin();
}
async function resetPassword(id){
  const data = await api(`/api/admin/users/${id}`, {method:'PATCH', body:{reset_password:true}});
  showToast('Temp password: ' + data.tempPassword);
}
async function adminDeleteLink(id){ await api(`/api/admin/links/${id}`, {method:'DELETE'}); renderAdmin(); }

function renderRedirectUrls(urls){
  const list = document.getElementById('redirectUrlList');
  list.innerHTML = urls.length ? urls.map(u=>`
    <div class="redirect-list-item"><span>${u.url}</span><button style="background:none;border:none;color:var(--text-faint);" onclick="removeRedirectUrl(${u.id})">✕</button></div>
  `).join('') : `<div style="font-size:12.5px; color:var(--text-faint);">No destinations added yet.</div>`;
}
document.getElementById('redirectEnableSwitch').addEventListener('click', async (e)=>{
  const nowOn = !e.target.classList.contains('on');
  await api('/api/admin/redirect', {method:'PATCH', body:{enabled: nowOn}});
  e.target.classList.toggle('on', nowOn);
  showToast('Smart redirects ' + (nowOn?'enabled':'disabled'));
});
document.getElementById('redirectInterval').addEventListener('change', async e=>{
  await api('/api/admin/redirect', {method:'PATCH', body:{interval: parseInt(e.target.value,10)}});
});
document.getElementById('redirectInterval').addEventListener('input', e=>{
  document.getElementById('redirectIntervalLabel').textContent = e.target.value;
});
document.getElementById('rotationSeg').addEventListener('click', async e=>{
  const btn = e.target.closest('button'); if(!btn) return;
  [...btn.parentElement.children].forEach(b=>b.classList.remove('active')); btn.classList.add('active');
  await api('/api/admin/redirect', {method:'PATCH', body:{mode: btn.dataset.mode}});
});
document.getElementById('addRedirectUrl').addEventListener('click', async ()=>{
  const input = document.getElementById('newRedirectUrl');
  if(!input.value.trim()){ showToast('Enter a URL first'); return; }
  await api('/api/admin/redirect/urls', {method:'POST', body:{url: input.value.trim()}});
  input.value = '';
  renderAdmin();
});
async function removeRedirectUrl(id){ await api(`/api/admin/redirect/urls/${id}`, {method:'DELETE'}); renderAdmin(); }

document.getElementById('addBlogPost').addEventListener('click', async ()=>{
  const input = document.getElementById('newBlogTitle');
  if(!input.value.trim()){ showToast('Enter a title first'); return; }
  await api('/api/admin/blog', {method:'POST', body:{title: input.value.trim()}});
  input.value = '';
  renderAdmin();
  showToast('Post published');
});

/* ================= INIT ================= */
(async function init(){
  await loadAuthState();
  try{
    const stats = await api('/api/stats');
    document.getElementById('statLinks').textContent = stats.links;
    document.getElementById('statClicks').textContent = stats.clicks;
    document.getElementById('statUsers').textContent = stats.users;
  }catch(e){}
})();
