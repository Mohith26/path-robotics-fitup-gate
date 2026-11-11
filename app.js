// Fit-up Gate: concept feature for Path Robotics JobBuilder. Everything shown is computed here
// from data/job.json with src/core.js (envelopes, decisions, NDT plan, CUSUM, forecasts).
import * as C from './src/core.js';

// ------------------------------------------------------------ icons (Lucide-style outline)
const ic = (d, s = 16, w = 1.6) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const I = {
  search: (s) => ic('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', s),
  chev: (s) => ic('<path d="m9 6 6 6-6 6"/>', s),
  down: (s) => ic('<path d="m6 9 6 6 6-6"/>', s),
  up: (s) => ic('<path d="M12 19V5"/><path d="m6 11 6-6 6 6"/>', s),
  info: (s) => ic('<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>', s),
  gear: (s) => ic('<path d="M12.2 2h-.4a2 2 0 0 0-2 2v.2a2 2 0 0 1-1 1.7l-.4.3a2 2 0 0 1-2 0l-.2-.1a2 2 0 0 0-2.7.7l-.2.4a2 2 0 0 0 .7 2.7l.2.1a2 2 0 0 1 1 1.7v.5a2 2 0 0 1-1 1.8l-.2.1a2 2 0 0 0-.7 2.7l.2.4a2 2 0 0 0 2.7.7l.2-.1a2 2 0 0 1 2 0l.4.3a2 2 0 0 1 1 1.7v.2a2 2 0 0 0 2 2h.4a2 2 0 0 0 2-2v-.2a2 2 0 0 1 1-1.7l.4-.3a2 2 0 0 1 2 0l.2.1a2 2 0 0 0 2.7-.7l.2-.4a2 2 0 0 0-.7-2.7l-.2-.1a2 2 0 0 1-1-1.8v-.5a2 2 0 0 1 1-1.7l.2-.1a2 2 0 0 0 .7-2.7l-.2-.4a2 2 0 0 0-2.7-.7l-.2.1a2 2 0 0 1-2 0l-.4-.3a2 2 0 0 1-1-1.7V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>', s),
  x: (s) => ic('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>', s),
  user: (s) => ic('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="10" r="3"/><path d="M6.7 18.4a6 6 0 0 1 10.6 0"/>', s),
  dl: (s) => ic('<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>', s),
  alert: (s) => ic('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>', s),
  check: (s) => ic('<path d="M20 6 9 17l-5-5"/>', s),
  kbd: (s) => ic('<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>', s),
  sliders: (s) => ic('<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>', s),
  undo: (s) => ic('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>', s),
};

// ------------------------------------------------------------ state
const LS = 'path-fitup-gate:v1';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;
const inch = (mm) => C.fmtIn(mm, 3);
const SHIFT = 12, PENDING = 3;
let job, results, D = null;
const st = {
  mode: 'gate', part: null, feature: null, tab: 'fitup', search: '', sort: 'created', asc: true,
  tau: 0.01, delta: 0.05, spot: 0.05, costs: { refit: 35, defect: 420 }, status: {}, ack: {}, checked: [],
};
function load() {
  try { const s = JSON.parse(localStorage.getItem(LS) || '{}'); for (const k of ['tau', 'delta', 'spot', 'costs', 'status', 'ack', 'checked']) if (s[k] !== undefined) st[k] = s[k]; } catch { /* ignore */ }
}
function save() {
  localStorage.setItem(LS, JSON.stringify({ tau: st.tau, delta: st.delta, spot: st.spot, costs: st.costs, status: st.status, ack: st.ack, checked: st.checked }));
}
function readHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get('part')) st.part = h.get('part');
  if (h.get('feature')) st.feature = h.get('feature');
  if (h.get('tab')) st.tab = h.get('tab');
  if (h.get('mode')) st.mode = h.get('mode');
}
function writeHash() {
  const h = new URLSearchParams();
  if (st.mode !== 'gate') h.set('mode', st.mode);
  if (st.part) h.set('part', st.part);
  if (st.feature) { h.set('feature', st.feature); h.set('tab', st.tab); }
  history.replaceState(null, '', `#${h.toString()}`);
}

// ------------------------------------------------------------ derived model
function derive() {
  const P = job.params;
  const key = `${st.tau}|${st.delta}`;
  if (derive.key !== key) {
    derive.envs = {};
    for (const cls of Object.keys(job.classes)) derive.envs[cls] = C.fitEnvelope(job.fleet[cls].n, job.fleet[cls].k, { tau: st.tau, delta: st.delta });
    derive.key = key;
  }
  const envs = derive.envs;
  const N = job.stream.sns.length, s0 = N - SHIFT;
  const feats = job.features.map((f, i) => {
    const series = job.stream.gaps.map((r) => r[i]);
    const cu = C.cusum(series, f.ref, P.cusumK, f.h);
    const env = envs[f.cls];
    return { ...f, i, series, S: cu.S, alarm: cu.alarm, ttl: C.partsToLimit(series, env.gStar), env };
  });
  const parts = [];
  for (let p = s0; p < N; p++) {
    const sn = job.stream.sns[p];
    const seams = feats.map((f) => {
      const gap = job.stream.gaps[p][f.i];
      const d = C.seamDecision(f.env, gap, f.nominalMm, st.costs);
      return { fid: f.id, cls: f.cls, lengthIn: f.lengthIn, gap, ...d, upper: C.upperAt(f.env, gap), ndt: false, leg: C.requiredLegIn(job.classes[f.cls].legIn, gap) };
    });
    const hasRefit = seams.some((s) => s.action === 'refit');
    const def = p >= N - PENDING ? 'pending' : hasRefit ? 'refit' : 'released';
    parts.push({ p, sn, at: job.stream.scannedAt[p], seams, status: st.status[sn] || def });
  }
  // Shift NDT plan over welded seams of parts not sent back.
  const pool = [];
  for (const pt of parts) if (pt.status !== 'refit') for (const s of pt.seams) if (s.action === 'weld') pool.push(s);
  const totalMin = pool.reduce((t, s) => t + C.ndtMinutes(s.lengthIn), 0);
  const budget = st.spot * totalMin;
  const plan = C.planNdt(pool, budget, P.invisibleShare, P.ndtSensitivity);
  for (const i of plan.chosen) pool[i].ndt = true;
  const caughtExp = plan.expected;
  const allInvisible = pool.reduce((t, s) => t + s.risk * P.invisibleShare, 0);
  const alarms = feats.filter((f) => f.alarm >= 0).sort((a, b) => a.alarm - b.alarm);
  D = { envs, feats, parts, plan, budget, totalMin, caughtExp, allInvisible, alarms, N };
}
const featById = (id) => D.feats.find((f) => f.id === id);
const partBySn = (sn) => D.parts.find((p) => p.sn === sn);
function seamState(s) {
  if (s.action === 'refit') return 'refit';
  if (s.ndt) return 'ndt';
  return s.reason === 'outside' ? 'outside' : 'ok';
}
const COLORS = { ok: '#2ec4d6', outside: '#7c8fd6', ndt: '#d98a00', refit: '#eb5231', none: '#2ec4d6' };
const LABEL = { ok: 'Within envelope', outside: 'Outside envelope · weld', ndt: 'NDT planned', refit: 'Refit before weld' };
const fmtTime = (iso) => new Date(iso).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
const fmtDay = (iso) => new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' });

// ------------------------------------------------------------ render: top + left
function renderTop() {
  $('jobname').textContent = job.job.name;
  $('jobstatus').textContent = job.job.status;
  $('btn-keys').innerHTML = I.kbd(18);
  $('usericon').innerHTML = I.user(22);
  $('usercaret').innerHTML = I.down(14);
  $('btn-settings').innerHTML = I.gear(18);
  $('mode-gate').setAttribute('aria-current', st.mode === 'gate' ? 'page' : 'false');
  $('mode-features').setAttribute('aria-current', st.mode === 'features' ? 'page' : 'false');
  $('layout').style.gridTemplateColumns = st.mode === 'gate' ? '' : (innerWidth <= 1360 ? '330px 1fr 0px' : '372px 1fr 0px');
  $('right').style.display = st.mode === 'gate' ? '' : 'none';
  document.querySelector('.foot').style.right = st.mode === 'gate' ? '' : '0px';
}
function sortedFeatures() {
  const part = partBySn(st.part);
  const q = st.search.trim().toLowerCase();
  let fs = D.feats.filter((f) => !q || f.id.toLowerCase().includes(q) || f.name.toLowerCase().includes(q));
  const key = {
    created: (f) => f.i,
    risk: (f) => part.seams[f.i].risk,
    gap: (f) => part.seams[f.i].gap,
  }[st.sort];
  fs = [...fs].sort((a, b) => (key(a) - key(b)) * (st.asc ? 1 : -1));
  return fs;
}
function renderLeft() {
  const part = partBySn(st.part);
  const fs = sortedFeatures();
  const drifting = D.alarms.length;
  const al = D.alarms[0];
  let alert = '';
  if (st.mode === 'gate' && al) {
    const stations = [...new Set(D.alarms.map((f) => f.station))];
    const st0 = stations.join(' / ');
    const ids = D.alarms.map((f) => f.id);
    const acked = st.ack[al.id];
    const ttl = Math.min(...D.alarms.map((f) => f.ttl));
    alert = `<div class="alert ${acked ? 'ack' : ''}" role="${acked ? 'note' : 'alert'}">${I.alert(16)}<div>
      <b>Fit-up drift at fixture station${stations.length > 1 ? 's' : ''} ${st0}</b> · ${ids.join(', ')} gaps rising. CUSUM alarm at SN ${job.stream.sns[al.alarm]}, ${D.N - 1 - al.alarm} parts ago; ${Number.isFinite(ttl) ? `the trend reaches the certified gap in about ${ttl} part${ttl === 1 ? '' : 's'}` : 'the trend is flat'}.
      ${acked ? `<div class="note" style="margin:4px 0 0">Flagged to fabrication ${esc(acked)}.</div>` : ''}
      <div class="acts"><button class="link" data-open="${al.id}">Open ${al.id}</button>${acked ? `<button class="link" data-unack="1">Undo</button>` : `<button class="link" data-ack="1">Flag to fabrication</button>`}</div></div></div>`;
  }
  const rows = fs.map((f) => {
    const s = part.seams[f.i];
    const state = st.mode === 'gate' ? seamState(s) : 'none';
    const dotc = state === 'none' ? '' : state;
    const drift = f.alarm >= 0 && st.mode === 'gate';
    return `<div class="row" role="option" tabindex="0" aria-selected="${st.feature === f.id}" data-f="${f.id}" title="${esc(f.name)}">
      <input type="checkbox" aria-label="Select ${f.id}" data-chk="${f.id}" ${st.checked.includes(f.id) ? 'checked' : ''}>
      <span class="id">${f.id}</span>
      <span class="len">${f.lengthIn.toFixed(2)}"</span>
      <span class="gap">${st.mode === 'gate' ? `${drift ? '<span class="drifttag" title="CUSUM drift alarm">drift</span>' : ''}${C.toIn(s.gap).toFixed(3)}" <span class="dot ${dotc}" title="${LABEL[state]}"></span>` : '0°'}</span>
      <span class="chev">${I.chev(14)}</span></div>`;
  }).join('');
  $('left').innerHTML = `
    <div class="phead"><h2>Feature list</h2><span class="meta">${st.mode === 'gate' && drifting ? `<span class="dot drift"></span>${drifting} drifting` : '<span class="dot"></span>Not sequenced'}</span></div>
    <label class="search">${I.search(15)}<span class="sr-only">Search features</span><input id="q" placeholder="Search by feature name" value="${esc(st.search)}" autocomplete="off"></label>
    <div class="toolbar">
      <label><input type="checkbox" id="selall" ${st.checked.length === D.feats.length ? 'checked' : ''}> Select All</label>
      <span class="sort">Sort by <button class="dir" id="sortdir" aria-label="Sort direction">${st.asc ? I.up(13) : `<span style="display:inline-block;transform:rotate(180deg)">${I.up(13)}</span>`}</button>
      <select id="sortkey" aria-label="Sort key"><option value="created" ${st.sort === 'created' ? 'selected' : ''}>Creation Date</option>${st.mode === 'gate' ? `<option value="risk" ${st.sort === 'risk' ? 'selected' : ''}>Defect risk</option><option value="gap" ${st.sort === 'gap' ? 'selected' : ''}>Scanned gap</option>` : ''}</select></span>
    </div>
    ${alert}
    <div class="flist" role="listbox" aria-label="Features">${rows || `<div class="empty"><b>No features match "${esc(st.search)}"</b>Try an ID like MF-012 or a word like "hanger".</div>`}</div>`;
}

// ------------------------------------------------------------ render: right (gate queue)
function partCounts(pt) {
  const c = { ok: 0, outside: 0, ndt: 0, refit: 0 };
  for (const s of pt.seams) c[seamState(s)]++;
  return c;
}
function renderRight() {
  if (st.mode !== 'gate') return;
  const refitSeams = D.parts.filter((p) => p.status !== 'released').reduce((t, p) => t + p.seams.filter((s) => s.action === 'refit').length, 0);
  const pendingN = D.parts.filter((p) => p.status === 'pending').length;
  const share = D.allInvisible > 0 ? D.caughtExp / (D.allInvisible * job.params.ndtSensitivity) : 0;
  const list = [...D.parts].reverse().map((pt) => {
    const c = partCounts(pt);
    const chip = { pending: '<span class="chip pending">Pending</span>', released: '<span class="chip released">Released</span>', refit: '<span class="chip refit">Sent back</span>' }[pt.status];
    return `<div class="part" role="option" tabindex="0" aria-selected="${pt.sn === st.part}" data-p="${pt.sn}">
      <span class="sn">SN ${pt.sn}</span>${chip}
      <span class="tm">Scanned ${fmtTime(pt.at)}</span><span></span>
      <span class="counts"><span><span class="dot ok"></span>${c.ok + c.outside} weld</span><span><span class="dot ndt"></span>${c.ndt} NDT</span><span><span class="dot refit"></span>${c.refit} refit</span>${c.outside ? `<span style="color:var(--muted)">${c.outside} outside envelope</span>` : ''}</span></div>`;
  }).join('');
  const pt = partBySn(st.part);
  const c = partCounts(pt);
  const refits = pt.seams.filter((s) => s.action === 'refit');
  const ndts = pt.seams.filter((s) => s.ndt);
  const codeRefit = refits.some((s) => s.reason === 'code');
  const why = [
    refits.length ? `${refits.length} seam${refits.length > 1 ? 's' : ''} to refit: ${refits.map((s) => `${s.fid} (${C.toIn(s.gap).toFixed(3)}"${s.reason === 'code' ? ', over D1.1 3/16"' : ''})`).join(', ')}.` : 'No seams need refit.',
    ndts.length ? `NDT planned on ${ndts.map((s) => s.fid).join(', ')}.` : '',
    c.outside ? `${c.outside} seam${c.outside > 1 ? 's' : ''} weld outside the certified envelope.` : '',
  ].filter(Boolean).join(' ');
  $('right').innerHTML = `
    <div class="gatehead"><div class="t"><h2>Fit-up Gate</h2><button class="btn ghost small" id="export" title="Export shift decisions (E)">${I.dl(14)} Export</button></div>
      <div class="sub">${esc(job.job.cell)} · last ${SHIFT} parts · ${fmtDay(D.parts[0].at)}</div></div>
    <div class="kpis">
      <div class="kpi ${refitSeams ? 'warn' : ''}"><div class="v">${refitSeams}</div><div class="l">seam${refitSeams === 1 ? '' : 's'} to refit</div></div>
      <div class="kpi"><div class="v">${D.plan.chosen.length}</div><div class="l">NDT seams · ${Math.round(D.plan.minutes)}/${Math.round(D.budget)} min</div></div>
      <div class="kpi" title="Expected scan-invisible defects the NDT plan targets, as a share of all expected in released and pending parts"><div class="v">${Math.round(share * 100)}%</div><div class="l">hidden-defect risk covered</div></div>
    </div>
    <div class="parts" role="listbox" aria-label="Scanned parts">${list}</div>
    <div class="gatefoot">
      <div class="why"><b style="font-weight:500">SN ${pt.sn}</b> · ${why}${pendingN ? '' : ' All parts in this shift are dispositioned.'}</div>
      <div class="btns">
        ${pt.status === 'pending' ? `<button class="btn ghost" id="sendback" ${refits.length ? '' : 'disabled'} title="Send back for refit (B)">Send back for refit</button>
        <button class="btn primary" id="release" ${codeRefit ? 'disabled title="A seam is over the AWS D1.1 3/16 in limit"' : 'title="Release to cell (R)"'}>Release to cell</button>`
    : `<button class="btn ghost" id="reopen">${I.undo(14)} Reopen</button>`}
      </div>
    </div>`;
}

// ------------------------------------------------------------ render: drawer + charts
function envelopeSvg(f, gapMm) {
  const e = f.env, W = 484, H = 214, m = { l: 40, r: 12, t: 22, b: 30 };
  const xMax = 5.08, x = (mm) => m.l + (mm / xMax) * (W - m.l - m.r);
  const ly = (p) => Math.log10(Math.max(p, 1e-4));
  const y = (p) => m.t + (1 - (ly(p) + 4) / 4) * (H - m.t - m.b);
  const bw = C.BIN_MM;
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Defect rate versus root gap for ${f.id}">`;
  s += `<defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="#eb5231" stroke-opacity=".28" stroke-width="2"/></pattern></defs>`;
  s += `<rect x="${x(C.D11_UPSIZE_MM)}" y="${m.t}" width="${x(C.D11_MAX_MM) - x(C.D11_UPSIZE_MM)}" height="${H - m.t - m.b}" fill="#fff6e5"/>`;
  s += `<rect x="${x(C.D11_MAX_MM)}" y="${m.t}" width="${x(xMax) - x(C.D11_MAX_MM)}" height="${H - m.t - m.b}" fill="url(#hatch)"/>`;
  s += `<rect x="${x(0)}" y="${m.t}" width="${x(e.gStar) - x(0)}" height="${H - m.t - m.b}" fill="#e8f5f8"/>`;
  s += `<text x="${(x(C.D11_UPSIZE_MM) + x(C.D11_MAX_MM)) / 2}" y="${m.t - 8}" text-anchor="middle">D1.1: upsize leg by gap</text><text x="${(x(C.D11_MAX_MM) + x(xMax)) / 2}" y="${m.t - 8}" text-anchor="middle">Refit</text>`;
  for (const p of [1e-3, 1e-2, 1e-1, 1]) s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(p)}" y2="${y(p)}" stroke="#e2e4e6"/><text x="${m.l - 6}" y="${y(p) + 3}" text-anchor="end">${p >= 0.01 ? `${p * 100}%` : `${p * 100}%`}</text>`;
  for (const t of [0, 0.05, 0.1, 0.15, 0.2]) s += `<text x="${x(t * 25.4)}" y="${H - m.b + 14}" text-anchor="middle">${t.toFixed(2)}"</text>`;
  s += `<text x="${W - m.r}" y="${H - 3}" text-anchor="end">Scanned root gap</text>`;
  s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(e.tau)}" y2="${y(e.tau)}" stroke="#55595d" stroke-dasharray="3 3"/><text x="${W - m.r}" y="${y(e.tau) - 4}" text-anchor="end" style="fill:#55595d">Target ${pct(e.tau, e.tau < 0.01 ? 1 : 0)}</text>`;
  const step = (arr, dash, col, wdt) => {
    let d = '';
    for (let i = 0; i < arr.length && i * bw < xMax; i++) d += `${i ? 'L' : 'M'}${x(i * bw).toFixed(1)},${y(arr[i]).toFixed(1)}L${x(Math.min(xMax, (i + 1) * bw)).toFixed(1)},${y(arr[i]).toFixed(1)}`;
    return `<path d="${d}" fill="none" stroke="${col}" stroke-width="${wdt}" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`;
  };
  s += step(e.upper, '5 3', '#157a90', 1.4) + step(e.iso, '', '#1b8ea6', 2);
  const maxN = Math.max(...e.n);
  for (let i = 0; i < e.n.length; i++) {
    if (!e.n[i] || (i + 0.5) * bw > xMax) continue;
    const r = 2.2 + 3 * Math.sqrt(e.n[i] / maxN);
    s += `<circle cx="${x((i + 0.5) * bw)}" cy="${y(Math.max(e.rate[i], 1e-4))}" r="${r.toFixed(2)}" fill="#8e9296" fill-opacity=".75" stroke="#fff" stroke-width=".8"><title>${(i * bw).toFixed(1)}-${((i + 1) * bw).toFixed(1)} mm: ${e.k[i]} of ${e.n[i]} seams defective</title></circle>`;
  }
  s += `<line x1="${x(e.gStar)}" x2="${x(e.gStar)}" y1="${m.t}" y2="${H - m.b}" stroke="#1b8ea6" stroke-width="1.5"/><text x="${x(e.gStar) - 4}" y="${m.t + 12}" text-anchor="end" style="fill:#157a90;font-weight:500">Certified ${C.toIn(e.gStar).toFixed(3)}"</text>`;
  if (gapMm != null) {
    const gx = x(Math.min(gapMm, xMax - 0.02));
    s += `<path d="M${gx},${H - m.b - 1}l-5,8h10z" fill="#2f3133"/><line x1="${gx}" x2="${gx}" y1="${m.t}" y2="${H - m.b}" stroke="#2f3133" stroke-dasharray="2 3" stroke-opacity=".5"/>`;
  }
  return s + '</svg>';
}
function historySvg(f) {
  const W = 484, H = 170, m = { l: 44, r: 12, t: 12, b: 22 }, n = 120;
  const ys = f.series.slice(-n), S = f.S.slice(-n), off = f.series.length - n;
  const yMaxIn = Math.max(0.12, Math.ceil(Math.max(...ys.map(C.toIn), C.toIn(f.env.gStar)) * 40) / 40);
  const gH = 100, cTop = m.t + gH + 14, cH = H - cTop - m.b;
  const x = (i) => m.l + (i / (n - 1)) * (W - m.l - m.r);
  const y = (mm) => m.t + (1 - C.toIn(mm) / yMaxIn) * gH;
  const hMax = Math.max(f.h * 1.25, ...S);
  const yc = (v) => cTop + (1 - v / hMax) * cH;
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Scanned gap history and CUSUM for ${f.id}">`;
  for (const t of [0, yMaxIn / 2, yMaxIn]) s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(t * 25.4)}" y2="${y(t * 25.4)}" stroke="#eef0f1"/><text x="${m.l - 6}" y="${y(t * 25.4) + 3}" text-anchor="end">${t.toFixed(2)}"</text>`;
  s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(f.env.gStar)}" y2="${y(f.env.gStar)}" stroke="#1b8ea6" stroke-dasharray="5 3"/><text x="${m.l + 4}" y="${y(f.env.gStar) - 4}" style="fill:#157a90">Certified gap ${C.toIn(f.env.gStar).toFixed(3)}"</text>`;
  s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(f.ref.mu)}" y2="${y(f.ref.mu)}" stroke="#9aa0a6"/>`;
  ys.forEach((g, i) => {
    const after = f.alarm >= 0 && off + i >= f.alarm;
    s += `<circle cx="${x(i).toFixed(1)}" cy="${y(Math.min(g, yMaxIn * 25.4)).toFixed(1)}" r="2.1" fill="${after ? '#d98a00' : '#8e9296'}" fill-opacity="${after ? 0.9 : 0.6}"/>`;
  });
  if (f.alarm >= 0) {
    const tsW = 40, tail = f.series.slice(-tsW), ts = C.theilSen(tail);
    const i0 = n - tsW, yA = ts.intercept, yB = ts.intercept + ts.slope * (tsW - 1);
    s += `<line x1="${x(i0)}" x2="${x(n - 1)}" y1="${y(yA)}" y2="${y(yB)}" stroke="#d98a00" stroke-width="1.6"/>`;
    const ax = x(Math.max(0, f.alarm - off));
    s += `<line x1="${ax}" x2="${ax}" y1="${m.t}" y2="${H - m.b}" stroke="#d98a00" stroke-dasharray="2 3"/><text x="${ax + 4}" y="${m.t + 9}" style="fill:#a46800">CUSUM alarm</text>`;
  }
  let d = '';
  S.forEach((v, i) => { d += `${i ? 'L' : 'M'}${x(i).toFixed(1)},${yc(Math.min(v, hMax)).toFixed(1)}`; });
  s += `<text x="${m.l - 6}" y="${cTop + 8}" text-anchor="end" style="font-size:9px">CUSUM</text><line x1="${m.l}" x2="${W - m.r}" y1="${yc(f.h)}" y2="${yc(f.h)}" stroke="#eb5231" stroke-dasharray="3 3"/><text x="${W - m.r}" y="${yc(f.h) - 3}" text-anchor="end" style="fill:#b23b20">h = ${f.h.toFixed(2)}</text>`;
  s += `<path d="${d}" fill="none" stroke="#55595d" stroke-width="1.3"/><line x1="${m.l}" x2="${W - m.r}" y1="${cTop + cH}" y2="${cTop + cH}" stroke="#e2e4e6"/>`;
  s += `<text x="${m.l}" y="${H - 6}">SN ${job.stream.sns[off]}</text><text x="${W - m.r}" y="${H - 6}" text-anchor="end">SN ${job.stream.sns[off + n - 1]}</text>`;
  return s + '</svg>';
}
function renderDrawer() {
  const dr = $('drawer');
  if (!st.feature) { dr.classList.remove('open'); dr.setAttribute('aria-hidden', 'true'); return; }
  const f = featById(st.feature);
  if (!f) { st.feature = null; return renderDrawer(); }
  const pt = partBySn(st.part), s = pt.seams[f.i], cls = job.classes[f.cls], e = f.env, fleet = job.fleet[f.cls];
  const state = seamState(s);
  const tab = st.mode === 'gate' ? st.tab : 'general';
  const tabs = ['General', 'Feature links', 'Path plans', ...(st.mode === 'gate' ? ['Fit-up'] : [])].map((t) => {
    const key = t.toLowerCase().replace(/[^a-z]/g, '');
    const live = key === 'general' || key === 'fitup';
    return `<button role="tab" data-tab="${key}" aria-selected="${tab === key}" ${live ? '' : 'aria-disabled="true" title="Not part of this concept"'}>${t}${key === 'fitup' ? ' <span class="new" style="font-size:9px;color:var(--teal);background:var(--teal-50);border-radius:4px;padding:0 4px;font-weight:600">NEW</span>' : ''}</button>`;
  }).join('');
  let body = '';
  if (tab === 'general') {
    body = `<div class="sec">Feature definition</div>
      <div class="kv"><span class="k">Joint type</span><span class="v">${cls.label}</span></div>
      <div class="kv"><span class="k">Weld size</span><span class="v">${C.fracIn(cls.legIn)}</span></div>
      <div class="kv"><span class="k">Seam length</span><span class="v">${f.lengthIn.toFixed(2)}"</span></div>
      <div class="kv"><span class="k">Fixture station</span><span class="v">${f.station}</span></div>
      <div class="kv"><span class="k">Nominal root gap (this job)</span><span class="v">${inch(f.ref.mu)} <small>median of ${job.job.auditParts} first-article parts</small></span></div>`;
  } else {
    const verdictCol = COLORS[state];
    const legNote = s.gap > C.D11_UPSIZE_MM ? `${C.fracIn(cls.legIn)} → ${C.fracIn(s.leg)} <small>(+gap, D1.1)</small>` : `${C.fracIn(cls.legIn)} <small>as detailed</small>`;
    const ttl = f.alarm >= 0 ? (Number.isFinite(f.ttl) ? `about ${f.ttl} part${f.ttl === 1 ? '' : 's'}` : 'no crossing (flat trend)') : null;
    const ts = C.theilSen(f.series.slice(-40));
    body = `
      <div class="sec"><span>Fit-up envelope · ${cls.label} ${C.fracIn(cls.legIn)}</span><span>${fleet.n.reduce((a, b) => a + b, 0).toLocaleString()} fleet seams · ${fleet.cells} cells</span></div>
      ${envelopeSvg(f, s.gap)}
      <div class="note">Dots: observed defect rate per 0.2 mm gap bin. Solid: monotone (isotonic) fit. Dashed: ${pct(1 - e.delta, 0)} simultaneous upper bound. Every gap left of the certified line has a defect rate at or below ${pct(e.tau, e.tau < 0.01 ? 1 : 0)}, assuming the rate never falls as the gap opens.</div>
      <div class="sec">This part · SN ${pt.sn}</div>
      <div class="kv"><span class="k">Scanned root gap</span><span class="v">${inch(s.gap)} <small>${s.gap.toFixed(2)} mm</small></span></div>
      <div class="kv"><span class="k">Certified gap (target ${pct(e.tau, e.tau < 0.01 ? 1 : 0)}, ${pct(1 - e.delta, 0)} conf.)</span><span class="v">${inch(e.gStar)} <small>${e.gStar.toFixed(1)} mm</small></span></div>
      <div class="kv"><span class="k">Defect rate at this gap</span><span class="v">${pct(s.risk, 2)} <small>upper bound ${pct(s.upper, 2)}</small></span></div>
      <div class="kv"><span class="k">Required fillet leg</span><span class="v">${legNote}</span></div>
      <div class="kv"><span class="k">Gate decision</span><span class="v"><span class="verdict" style="color:${verdictCol}"><span class="dot" style="background:${verdictCol}"></span>${LABEL[state]}</span>${s.reason === 'cost' ? ' <small>expected repair cost > refit cost</small>' : s.reason === 'code' ? ' <small>over 3/16" (D1.1)</small>' : ''}</span></div>
      <div class="sec"><span>Gap history · last 120 parts</span><span>${f.alarm >= 0 ? `<span style="color:var(--amber)">Drift since SN ${job.stream.sns[f.alarm]}</span>` : 'In control'}</span></div>
      ${historySvg(f)}
      <div class="note">One-sided CUSUM on robust z-scores (reference: median ${inch(f.ref.mu)}, MAD-σ ${inch(f.ref.sigma)}), threshold calibrated to one false alarm per ${job.params.targetArl.toLocaleString()} parts. ${f.alarm >= 0 ? `Theil-Sen trend over the last 40 parts: ${ts.slope >= 0 ? '+' : ''}${(C.toIn(ts.slope) * 1000).toFixed(2)} thou per part; reaches the certified gap in ${ttl}.` : 'No sustained shift detected.'}</div>`;
  }
  dr.innerHTML = `
    <div class="dhead"><h3>${f.id}<span class="len">${f.lengthIn.toFixed(2)}"</span></h3>
      <div class="acts"><button class="iconbtn" id="dl-env" aria-label="Export envelope JSON" title="Export envelope JSON">${I.dl(17)}</button><button class="iconbtn" id="dclose" aria-label="Close feature" title="Close (Esc)">${I.x(18)}</button></div></div>
    <div class="dname">${esc(f.name)}</div>
    <div class="tabs" role="tablist">${tabs}</div>
    <div class="dbody" role="tabpanel">${body}</div>
    ${tab === 'fitup' ? `<div class="dfoot"><button class="btn ghost" id="dl-env2">${I.dl(14)} Envelope JSON</button>${f.alarm >= 0 ? (st.ack[D.alarms[0].id] ? `<button class="btn ghost" data-unack="1">${I.undo(14)} Unflag drift</button>` : `<button class="btn primary" data-ack="1">Flag drift to fabrication</button>`) : `<button class="btn primary" id="dclose2">Done</button>`}</div>` : ''}`;
  dr.classList.add('open');
  dr.removeAttribute('aria-hidden');
}

// ------------------------------------------------------------ viewport overlays
function renderOverlays() {
  const pt = partBySn(st.part);
  $('hint').innerHTML = st.mode === 'gate' ? `${I.info(15)} Click a seam to open its fit-up envelope and gap history` : `${I.info(15)} Ctrl + Click an edge on the model to create a seam`;
  if (st.mode === 'gate') {
    const c = partCounts(pt);
    $('vptl').style.display = '';
    $('vptl').innerHTML = `<div class="sn">SN ${pt.sn}</div><div class="sub">Pre-weld scan · ${fmtTime(pt.at)} · ${job.features.length} seams</div><div class="sub" style="margin-top:4px;color:var(--ink-2)">${c.ok} within · ${c.outside} outside · ${c.ndt} NDT · ${c.refit} refit</div>`;
    $('legend').style.display = '';
    const short = $('viewport').clientWidth - (st.feature ? 148 : 0) < 640;
    const SHORT = { ok: 'Within', outside: 'Outside · weld', ndt: 'NDT', refit: 'Refit' };
    $('legend').innerHTML = Object.entries(LABEL).map(([k, v]) => `<span title="${v}"><i style="background:${COLORS[k]}"></i>${short ? SHORT[k] : v}</span>`).join('');
  } else {
    $('vptl').style.display = 'none';
    $('legend').style.display = 'none';
  }
}

// ------------------------------------------------------------ 3D canvas (orthographic CAD view)
const view = { yaw: -0.5, pitch: 0.86, zoom: 1, hover: null, focus: true };
let geo = null;
function buildGeo() {
  const faces = [];
  for (const b of job.boxes) {
    const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max;
    const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
    const F = [[[0, 1, 2, 3], [0, 0, -1]], [[4, 5, 6, 7], [0, 0, 1]], [[0, 1, 5, 4], [0, -1, 0]], [[2, 3, 7, 6], [0, 1, 0]], [[1, 2, 6, 5], [1, 0, 0]], [[0, 3, 7, 4], [-1, 0, 0]]];
    for (const [q, n] of F) faces.push({ pts: q.map((i) => v[i]), n, kind: b.kind });
  }
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const b of job.boxes) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], b.min[k]); mx[k] = Math.max(mx[k], b.max[k]); }
  geo = { faces, c: mn.map((v, k) => (v + mx[k]) / 2), mn, mx };
}
function rot(p) {
  const x = p[0] - geo.c[0], y = p[1] - geo.c[1], z = p[2] - geo.c[2];
  const cy = Math.cos(view.yaw), sy = Math.sin(view.yaw), cp = Math.cos(view.pitch), sp = Math.sin(view.pitch);
  const xr = x * cy - y * sy, yr = x * sy + y * cy;
  return { sx: xr, sy: -(yr * sp + z * cp), depth: yr * cp - z * sp };
}
let scale = 1, W = 0, H = 0;
function draw() {
  const cv = $('cv'), vp = $('viewport');
  const dpr = window.devicePixelRatio || 1;
  W = vp.clientWidth; H = vp.clientHeight;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  // fit
  let ax = Infinity, bx = -Infinity, ay = Infinity, by = -Infinity;
  for (const f of geo.faces) for (const p of f.pts) { const r = rot(p); ax = Math.min(ax, r.sx); bx = Math.max(bx, r.sx); ay = Math.min(ay, r.sy); by = Math.max(by, r.sy); }
  const leftPad = st.feature ? (parseFloat(getComputedStyle($('drawer')).width) - $('left').clientWidth) : 0;
  const usableW = W - Math.max(0, leftPad) - 40;
  scale = Math.min(usableW / (bx - ax), (H - 190) / (by - ay)) * 0.98 * view.zoom;
  let cx = (ax + bx) / 2, cyy = (ay + by) / 2;
  if (st.feature && view.focus) {
    const f = featById(st.feature);
    const r0 = rot(f.seam[0]), r1 = rot(f.seam[1]);
    cx = (r0.sx + r1.sx) / 2 * 0.6 + cx * 0.4; cyy = (r0.sy + r1.sy) / 2 * 0.6 + cyy * 0.4;
    scale *= 1.7;
  }
  const ox = Math.max(0, leftPad) + 20 + usableW / 2 - cx * scale, oy = H / 2 + 8 - cyy * scale;
  const P = (p) => { const r = rot(p); return [ox + r.sx * scale, oy + r.sy * scale, r.depth]; };
  const cy = Math.cos(view.yaw), sy = Math.sin(view.yaw), cp = Math.cos(view.pitch), sp = Math.sin(view.pitch);
  const toCam = (n) => { const xr = n[0] * cy - n[1] * sy, yr = n[0] * sy + n[1] * cy; return -(yr * cp) + n[2] * sp; };
  const vis = [];
  for (const f of geo.faces) {
    const facing = toCam(f.n);
    if (facing <= 1e-6) continue;
    const pp = f.pts.map(P);
    vis.push({ pp, d: pp.reduce((s, q) => s + q[2], 0) / 4, facing, kind: f.kind, n: f.n });
  }
  vis.sort((a, b) => b.d - a.d);
  for (const f of vis) {
    g.beginPath();
    f.pp.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])));
    g.closePath();
    const lum = f.n[2] > 0 ? 252 : f.n[2] < 0 ? 228 : 240 + Math.round(10 * f.facing);
    g.fillStyle = f.kind === 'plate' ? `rgb(${lum - 8},${lum - 7},${lum - 6})` : `rgb(${lum},${lum},${lum})`;
    g.fill();
    g.strokeStyle = 'rgba(64,68,72,.66)';
    g.lineWidth = 0.75;
    g.stroke();
  }
  // seams
  const pt = partBySn(st.part);
  D.seamScreen = [];
  for (const f of D.feats) {
    const a = P(f.seam[0]), b = P(f.seam[1]);
    const state = st.mode === 'gate' ? seamState(pt.seams[f.i]) : 'none';
    const sel = st.feature === f.id, hov = view.hover === f.id;
    if (sel || hov) { g.strokeStyle = 'rgba(27,142,166,.25)'; g.lineWidth = 12; g.lineCap = 'round'; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
    g.strokeStyle = COLORS[state];
    g.lineWidth = sel ? 6 : 4.2;
    g.lineCap = 'round';
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
    if (st.mode === 'gate' && f.alarm >= 0) { g.fillStyle = '#d98a00'; g.beginPath(); g.arc((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 3, 0, 7); g.fill(); }
    D.seamScreen.push({ id: f.id, a, b });
  }
  // labels for selected / hovered seams (JobBuilder style "TH-003")
  for (const id of [view.hover, st.feature]) {
    if (!id) continue;
    const s = D.seamScreen.find((q) => q.id === id), f = featById(id), seam = pt.seams[f.i];
    const label = st.mode === 'gate' ? `${id}  ${C.toIn(seam.gap).toFixed(3)}"` : id;
    g.font = '500 13px Poppins, sans-serif';
    const w = g.measureText(label).width + 16;
    let tx = (s.a[0] + s.b[0]) / 2 + 12, ty = Math.min(s.a[1], s.b[1]) - 14;
    if (tx + w > W - 10) tx = (s.a[0] + s.b[0]) / 2 - 12 - w;
    ty = Math.max(30, ty);
    g.fillStyle = 'rgba(255,255,255,.95)'; g.strokeStyle = '#b9dde6'; g.lineWidth = 1;
    g.beginPath(); g.roundRect(tx, ty - 15, w, 24, 4); g.fill(); g.stroke();
    g.fillStyle = '#2f3133'; g.fillText(label, tx + 8, ty + 2);
  }
  // axis gizmo
  const gx = W - 52, gy = H - 64;
  const axes = [[[1, 0, 0], '#e0483c'], [[0, 1, 0], '#89b43a'], [[0, 0, 1], '#2f7fd1']];
  for (const [v, col] of axes) {
    const xr = v[0] * cy - v[1] * sy, yr = v[0] * sy + v[1] * cy;
    const ex = gx + xr * 22, ey = gy - (yr * sp + v[2] * cp) * 22;
    g.strokeStyle = col; g.lineWidth = 1.6; g.beginPath(); g.moveTo(gx, gy); g.lineTo(ex, ey); g.stroke();
    g.fillStyle = col; g.beginPath(); g.arc(ex, ey, 4.5, 0, 7); g.fill();
    g.beginPath(); g.arc(gx - (ex - gx) * 0.6, gy - (ey - gy) * 0.6, 3, 0, 7); g.globalAlpha = 0.45; g.fill(); g.globalAlpha = 1;
  }
}
function hitSeam(mx, my) {
  let best = null, bd = 10;
  for (const s of D.seamScreen || []) {
    const [x1, y1] = s.a, [x2, y2] = s.b, dx = x2 - x1, dy = y2 - y1;
    const t = Math.max(0, Math.min(1, ((mx - x1) * dx + (my - y1) * dy) / (dx * dx + dy * dy || 1)));
    const d = Math.hypot(mx - (x1 + t * dx), my - (y1 + t * dy));
    if (d < bd) { bd = d; best = s.id; }
  }
  return best;
}

// ------------------------------------------------------------ actions
function renderAll() { derive(); renderTop(); renderLeft(); renderRight(); renderDrawer(); $('viewport').classList.toggle('drawer-open', !!st.feature); renderOverlays(); draw(); writeHash(); }
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2400); }
function openFeature(id, tab) { st.feature = id; if (tab) st.tab = tab; renderAll(); }
function selectPart(sn) { st.part = sn; renderAll(); }
function stepPart(d) {
  const i = D.parts.findIndex((p) => p.sn === st.part);
  const j = Math.max(0, Math.min(D.parts.length - 1, i - d)); // list shows newest first
  selectPart(D.parts[j].sn);
  document.querySelector(`.part[data-p="${D.parts[j].sn}"]`)?.scrollIntoView({ block: 'nearest' });
}
function modal(html) { $('modal').innerHTML = html; $('scrim').classList.add('open'); setTimeout(() => $('modal').querySelector('[data-focus]')?.focus(), 0); }
function closeModal() { $('scrim').classList.remove('open'); }
function confirmBox(title, text, action, onOk) {
  modal(`<div class="mt"><span id="modal-title">${title}</span><button class="iconbtn" data-close aria-label="Close">${I.x(16)}</button></div>
    <div class="mb"><div class="bang">!</div><div>${text}</div></div>
    <div class="mf"><button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="okbtn" data-focus>${action}</button></div>`);
  $('okbtn').onclick = () => { closeModal(); onOk(); };
}
function setStatus(sn, s) { st.status[sn] = s; save(); renderAll(); }
function doRelease() {
  const pt = partBySn(st.part);
  if (pt.status !== 'pending') return;
  const refits = pt.seams.filter((s) => s.action === 'refit');
  if (refits.some((s) => s.reason === 'code')) { toast('A seam is over the AWS D1.1 3/16" limit; send it back for refit'); return; }
  const go = () => { setStatus(pt.sn, 'released'); toast(`SN ${pt.sn} released to ${job.job.cell.split(' (')[0]}`); };
  if (refits.length) confirmBox('Confirm release', `${refits.map((s) => s.fid).join(', ')} ${refits.length > 1 ? 'are' : 'is'} past the cost-based refit gap. Release SN ${pt.sn} anyway? NDT will be re-planned.`, 'Release anyway', go);
  else go();
}
function doSendBack() {
  const pt = partBySn(st.part);
  if (pt.status !== 'pending') return;
  const refits = pt.seams.filter((s) => s.action === 'refit');
  if (!refits.length) return;
  confirmBox('Confirm send back', `Send SN ${pt.sn} back to fit-up? ${refits.map((s) => `${s.fid} (${C.toIn(s.gap).toFixed(3)}")`).join(', ')} will be re-fit and re-scanned before welding.`, 'Send back', () => { setStatus(pt.sn, 'refit'); toast(`SN ${pt.sn} sent back for refit`); });
}
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
}
function exportShift() {
  const rows = [];
  for (const pt of D.parts) for (const s of pt.seams) rows.push({ serial: pt.sn, scanned_at: pt.at, part_status: pt.status, feature: s.fid, joint_class: s.cls, gap_in: C.toIn(s.gap).toFixed(4), gap_mm: s.gap.toFixed(3), defect_rate: s.risk.toFixed(5), defect_rate_upper: s.upper.toFixed(5), decision: seamState(s), reason: s.reason, required_leg_in: s.leg.toFixed(4) });
  download(`fitup-gate_${job.job.name}_${D.parts[0].sn}-${D.parts[D.parts.length - 1].sn}.csv`, C.toCsv(rows), 'text/csv');
  toast(`Exported ${rows.length} seam decisions`);
}
function exportEnvelope() {
  const f = featById(st.feature), e = f.env;
  download(`envelope_${f.cls}.json`, JSON.stringify({ jointClass: f.cls, tau: e.tau, confidence: 1 - e.delta, certifiedGapMm: e.gStar, binMm: C.BIN_MM, n: e.n, defects: e.k, isotonic: e.iso, upper: e.upper }, null, 1), 'application/json');
}
function openSettings() {
  modal(`<div class="mt"><span id="modal-title">Gate settings</span><button class="iconbtn" data-close aria-label="Close">${I.x(16)}</button></div>
    <div class="form">
      <label for="s-tau">Target defect rate</label><select id="s-tau" data-focus>${[0.005, 0.01, 0.02].map((v) => `<option value="${v}" ${v === st.tau ? 'selected' : ''}>${pct(v, v < 0.01 ? 1 : 0)}</option>`).join('')}</select>
      <label for="s-conf">Confidence</label><select id="s-conf">${[0.1, 0.05, 0.01].map((v) => `<option value="${v}" ${v === st.delta ? 'selected' : ''}>${pct(1 - v, 0)}</option>`).join('')}</select>
      <label for="s-spot">NDT budget (share of shift NDT minutes)</label><select id="s-spot">${[0.025, 0.05, 0.1].map((v) => `<option value="${v}" ${v === st.spot ? 'selected' : ''}>${pct(v, v < 0.05 ? 1 : 0)}</option>`).join('')}</select>
      <label for="s-refit">Refit cost per seam (USD)</label><input id="s-refit" type="number" min="1" step="1" value="${st.costs.refit}">
      <label for="s-def">Weld defect repair cost (USD)</label><input id="s-def" type="number" min="1" step="1" value="${st.costs.defect}">
      <div class="hintline">Costs set the refit-vs-weld threshold: refit when (defect rate at gap − at nominal) × repair cost exceeds the refit cost.</div>
    </div>
    <div class="mf"><button class="btn ghost" id="s-reset">Reset demo</button><button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="s-apply">Apply</button></div>`);
  $('s-apply').onclick = () => {
    const r = +$('s-refit').value, d = +$('s-def').value;
    if (!(r > 0 && d > 0)) { toast('Costs must be positive numbers'); return; }
    st.tau = +$('s-tau').value; st.delta = +$('s-conf').value; st.spot = +$('s-spot').value; st.costs = { refit: r, defect: d };
    save(); closeModal(); renderAll(); toast(`Envelope recomputed at ${pct(st.tau, st.tau < 0.01 ? 1 : 0)} / ${pct(1 - st.delta, 0)}`);
  };
  $('s-reset').onclick = () => { localStorage.removeItem(LS); location.hash = ''; location.reload(); };
}
function openKeys() {
  modal(`<div class="mt"><span id="modal-title">Keyboard shortcuts</span><button class="iconbtn" data-close aria-label="Close" data-focus>${I.x(16)}</button></div>
    <div class="kbd"><span><kbd>J</kbd> / <kbd>K</kbd></span><span>Next / previous scanned part</span><span><kbd>[</kbd> / <kbd>]</kbd></span><span>Previous / next feature</span><span><kbd>/</kbd></span><span>Search features</span><span><kbd>R</kbd></span><span>Release part to cell</span><span><kbd>B</kbd></span><span>Send part back for refit</span><span><kbd>E</kbd></span><span>Export shift decisions (CSV)</span><span><kbd>Esc</kbd></span><span>Close feature or dialog</span></div>`);
}

// ------------------------------------------------------------ events
function wire() {
  document.addEventListener('click', (ev) => {
    const t = ev.target.closest('button, .row, .part, [data-close]');
    if (!t) return;
    if (t.matches('[data-close]')) return closeModal();
    if (t.dataset.chk) return;
    if (t.classList.contains('row')) { if (ev.target.matches('input')) return; return openFeature(t.dataset.f === st.feature ? null : t.dataset.f); }
    if (t.classList.contains('part')) return selectPart(t.dataset.p);
    if (t.dataset.open) return openFeature(t.dataset.open, 'fitup');
    if (t.dataset.ack) { st.ack[D.alarms[0].id] = `${fmtDay(new Date().toISOString())}, ${fmtTime(new Date().toISOString())}`; save(); renderAll(); return toast('Drift flagged to fabrication'); }
    if (t.dataset.unack) { delete st.ack[D.alarms[0].id]; save(); return renderAll(); }
    if (t.dataset.tab) { if (t.getAttribute('aria-disabled') === 'true') return; st.tab = t.dataset.tab; return renderAll(); }
    switch (t.id) {
      case 'dclose': st.feature = null; return renderAll();
      case 'release': return doRelease();
      case 'sendback': return doSendBack();
      case 'reopen': delete st.status[st.part]; st.status[st.part] = 'pending'; save(); return renderAll();
      case 'export': return exportShift();
      case 'dl-env': case 'dl-env2': return exportEnvelope();
      case 'dclose2': st.feature = null; return renderAll();
      case 'btn-settings': return openSettings();
      case 'btn-keys': return openKeys();
      case 'sortdir': st.asc = !st.asc; return renderAll();
      case 'mode-gate': st.mode = 'gate'; return renderAll();
      case 'mode-features': st.mode = 'features'; return renderAll();
      default:
    }
  });
  document.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.id === 'sortkey') { st.sort = t.value; renderAll(); }
    if (t.dataset.chk) { const id = t.dataset.chk; st.checked = t.checked ? [...new Set([...st.checked, id])] : st.checked.filter((x) => x !== id); save(); renderLeft(); }
    if (t.id === 'selall') { st.checked = t.checked ? D.feats.map((f) => f.id) : []; save(); renderLeft(); }
  });
  document.addEventListener('input', (ev) => {
    if (ev.target.id === 'q') { st.search = ev.target.value; const pos = ev.target.selectionStart; renderLeft(); const q = $('q'); q.focus(); q.setSelectionRange(pos, pos); }
  });
  document.addEventListener('keydown', (ev) => {
    const tg = ev.target instanceof Element ? ev.target : document.body;
    if (ev.key === 'Enter' && tg.matches('.row, .part')) { tg.click(); return; }
    if (tg.matches('input, select')) { if (ev.key === 'Escape') tg.blur(); return; }
    if ($('scrim').classList.contains('open')) { if (ev.key === 'Escape') closeModal(); return; }
    const k = ev.key;
    if (k === 'Escape' && st.feature) { st.feature = null; renderAll(); }
    else if (k === 'j' || k === 'J') stepPart(1);
    else if (k === 'k' || k === 'K') stepPart(-1);
    else if (k === '/') { ev.preventDefault(); $('q').focus(); }
    else if ((k === 'r' || k === 'R') && st.mode === 'gate') doRelease();
    else if ((k === 'b' || k === 'B') && st.mode === 'gate') doSendBack();
    else if ((k === 'e' || k === 'E') && st.mode === 'gate') exportShift();
    else if (k === '?') openKeys();
    else if (k === ']' || k === '[') {
      const fs = sortedFeatures(); if (!fs.length) return;
      const i = fs.findIndex((f) => f.id === st.feature);
      openFeature(fs[(i + (k === ']' ? 1 : -1) + fs.length) % fs.length].id);
    }
  });
  $('scrim').addEventListener('mousedown', (ev) => { if (ev.target === $('scrim')) closeModal(); });
  const cv = $('cv');
  let drag = null;
  cv.addEventListener('mousedown', (ev) => { drag = { x: ev.clientX, y: ev.clientY, yaw: view.yaw, pitch: view.pitch, moved: false }; });
  window.addEventListener('mousemove', (ev) => {
    const r = cv.getBoundingClientRect();
    if (drag) {
      const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) { drag.moved = true; cv.classList.add('dragging'); }
      view.yaw = drag.yaw + dx * 0.007; view.pitch = Math.max(0.08, Math.min(1.5, drag.pitch + dy * 0.006));
      draw();
    } else if (ev.target === cv) {
      const h = hitSeam(ev.clientX - r.left, ev.clientY - r.top);
      if (h !== view.hover) { view.hover = h; cv.style.cursor = h ? 'pointer' : ''; draw(); }
    }
  });
  window.addEventListener('mouseup', (ev) => {
    if (drag && !drag.moved && ev.target === cv) {
      const r = cv.getBoundingClientRect();
      const h = hitSeam(ev.clientX - r.left, ev.clientY - r.top);
      if (h) openFeature(h, st.mode === 'gate' ? 'fitup' : 'general');
    }
    drag = null; cv.classList.remove('dragging');
  });
  cv.addEventListener('wheel', (ev) => { ev.preventDefault(); view.zoom = Math.max(0.6, Math.min(4, view.zoom * Math.exp(-ev.deltaY * 0.0015))); draw(); }, { passive: false });
  cv.addEventListener('dblclick', () => { view.yaw = -0.5; view.pitch = 0.86; view.zoom = 1; draw(); });
  window.addEventListener('resize', () => renderAll());
  window.addEventListener('hashchange', () => { readHash(); renderAll(); });
}

// ------------------------------------------------------------ boot
async function boot() {
  try {
    const r = await fetch('data/job.json');
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    job = await r.json();
  } catch (e) {
    $('layout').innerHTML = `<div class="err" style="grid-column:1/-1"><p><b>Couldn't load job data.</b></p><p class="note">${esc(e.message)}</p><button class="btn primary" onclick="location.reload()">Retry</button></div>`;
    return;
  }
  load(); readHash();
  if (!job.stream.sns.slice(-SHIFT).includes(st.part)) st.part = job.stream.sns[job.stream.sns.length - 1];
  buildGeo(); wire(); renderAll();
  if (document.fonts) document.fonts.ready.then(() => draw());
}
boot();
