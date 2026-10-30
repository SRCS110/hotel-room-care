// Room Care UI. Plain DOM rendering (same structure as the approved prototype),
// backed by the /api routes. Every value from the server is escaped before it is
// placed in HTML.
import { ROLES, DEPTS, CATS, PRIORITIES, STATUSES, guessCat } from '../lib/constants';

const DAY = 864e5;
const TAB_LABEL = { staff: 'Staff', overview: 'Overview', rooms: 'Rooms', tickets: 'Tickets', queue: 'Queue', inspect: 'Turnover', log: 'Log' };

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ago = t => { const d = (Date.now() - t) / DAY; if (d < 1 / 24) return 'just now'; if (d < 1) return Math.round(d * 24) + 'h ago'; if (d < 2) return 'yesterday'; return Math.round(d) + 'd ago'; };
const days = t => (t ? Math.floor((Date.now() - t) / DAY) : null);
const fmt = t => new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const prioPill = p => `<span class="pill ${p === 'Urgent' ? 'p-bad' : p === 'High' ? 'p-warn' : p === 'Normal' ? 'p-info' : 'p-neutral'}">${esc(p)}</span>`;
const statPill = s => `<span class="pill ${s === 'Done' ? 'p-ok' : s === 'In progress' ? 'p-info' : s === 'On hold' ? 'p-warn' : 'p-neutral'}">${esc(s)}</span>`;
const deptPill = d => `<span class="pill d-${esc(d)}">${esc(DEPTS[d] || d)}</span>`;
const roleLabel = r => ROLES[r]?.label || 'Staff';

export function start(app, mode) {
  let st = null, busy = false, alive = true, toastTimer, pollTimer;
  const S = {
    tab: null, filter: 'all', tFilter: 'active', drawer: null, insp: null, logRoom: '', logType: '', toast: '',
    loginErr: '', lgName: '', lgRemember: true, choose: null,
    cmDraft: '', cmPrio: 'Normal', cmOoo: false, cmDept: 'maintenance', focusCm: false,
    addStaff: null, pinEdit: null, forceFull: false
  };

  const MQ = window.matchMedia('(max-width:700px)');
  S.mobile = MQ.matches;
  const onMQ = e => { S.mobile = e.matches; render(); };
  try { MQ.addEventListener('change', onMQ); } catch (e) {}

  /* ---------- Data ---------- */
  async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin', cache: 'no-store' });
    let data = {}; try { data = await res.json(); } catch (e) {}
    if (res.status === 401 && mode === 'app') { location.href = '/login'; throw new Error('Signed out'); }
    if (!res.ok) throw new Error(data.error || 'Something went wrong. Try again.');
    return data;
  }
  async function reload() { st = await api('/api/state'); }

  const role = () => st.me.portal;
  const isArea = r => (st.areas || []).includes(r);
  const where = r => (isArea(r) ? r : `Room ${r}`);
  const rmCell = r => `<span class="rm${isArea(r) ? ' area' : ''}">${esc(r)}</span>`;
  // Maintenance on a phone: one screen of active tickets; comment or mark done only.
  const fieldMode = () => simple() && role() === 'maintenance';
  const canSwitch = () => (role() === 'manager' || role() === 'maintenance') && st.properties.length > 1;
  const simple = () => S.mobile && !S.forceFull;
  const tabsFor = () => (simple() ? ROLES[role()].mobile : ROLES[role()].tabs);
  const seesAll = () => role() === 'frontdesk' || role() === 'manager';
  const staffOf = r => st.staff.filter(x => x.active && x.portal === r);
  const findTicket = id => st.tickets.find(x => String(x.id) === String(id));
  const otherProp = () => st.properties.find(p => p.id !== st.property.id);
  const ALL = () => st.checklist.flatMap(g => g.items);

  function roomInfo(room) {
    const ins = st.inspections.filter(i => i.room === room).sort((a, b) => b.at - a.at);
    const tk = st.tickets.filter(t => t.room === room), open = tk.filter(t => t.status !== 'Done');
    const ooo = st.oooRooms.includes(room);
    const lastMaint = st.log.filter(l => l.room === room && l.role === 'maintenance').sort((a, b) => b.at - a.at)[0];
    const lastIns = ins[0]?.at || null, since = days(lastIns);
    const state = ooo ? 'ooo' : open.length ? 'tk' : (since === null || since > 30) ? 'due' : 'ok';
    return { ins, tk, open, ooo, lastMaint, lastIns, since, state };
  }

  /* ---------- Render ---------- */
  function render() {
    if (!alive) return;
    if (mode === 'app' && st && !tabsFor().includes(S.tab)) S.tab = tabsFor()[0];
    app.innerHTML = mode === 'login' ? login() : st ? shell() : '<div class="loading"><span><span class="spin"></span>Loading</span></div>';
    if (S.focusCm) { const ta = document.getElementById('cm-body'); if (ta && !S.mobile) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } S.focusCm = false; }
    if (S.toast) {
      const t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = S.toast; app.appendChild(t);
      clearTimeout(toastTimer); toastTimer = setTimeout(() => { S.toast = ''; t.remove(); }, 2600);
    }
  }
  const toast = m => { S.toast = m; render(); };

  // One sign-in screen: name + PIN. The account decides portal and hotel.
  const ls = { get: k => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }, set: (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) {} } };
  function login() {
    const saved = ls.get('rc-name');
    const card = inner => `<div class="login-page"><div></div><div class="wrap login"><form class="login-card" data-form="login" autocomplete="off" novalidate>
      <div class="wordmark">Stay Santa Rosa</div><h1>Room Care</h1>${inner}</form></div></div>`;
    if (S.choose) return card(`<p class="sub">Your name and PIN open more than one dashboard. Which one?</p>
      <div class="choose">${S.choose.map(c => `<button type="button" class="btn" data-act="pickPortal" data-v="${c.staffId}">${esc(c.label)}</button>`).join('')}</div>
      ${S.loginErr ? `<p class="err" role="alert">${esc(S.loginErr)}</p>` : ''}
      <button type="button" class="linkish center" data-act="loginBack">Back</button>`);
    return card(`${saved ? `<div class="welcome"><span class="eyebrow">Welcome back</span><b>${esc(saved)}</b><button type="button" class="linkish" data-act="notMe">Not you?</button></div>`
        : `<p class="sub">Sign in to your dashboard</p>
      <label class="f">Your name<input id="lg-name" type="text" autocomplete="username" autocapitalize="words" spellcheck="false" maxlength="60" placeholder="e.g. Maria L." value="${esc(S.lgName || '')}"></label>`}
      <label class="f">PIN<input id="lg-pin" class="pin-input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="current-password" placeholder="••••" aria-describedby="lg-help"></label>
      ${saved ? '' : `<label class="check"><input id="lg-remember" type="checkbox" ${S.lgRemember === false ? '' : 'checked'}> Remember my name on this device</label>`}
      ${S.loginErr ? `<p class="err" role="alert">${esc(S.loginErr)}</p>` : ''}
      <button class="btn primary" type="submit">Sign in</button>
      <p id="lg-help" class="muted center" style="margin:0;font-size:13px">Forgot your PIN? Ask a manager to reset it.</p>`);
  }
  async function doLogin(body) {
    let r;
    try { r = await api('/api/login', { method: 'POST', body: { ...body, preferredProperty: ls.get('rc-prop') } }); }
    catch (err) { S.loginErr = err.message; return; }
    if (r.choose) { S.choose = r.choose; S.loginErr = ''; return; }
    if (S.lgRemember !== false || ls.get('rc-name')) ls.set('rc-name', r.name);
    ls.set('rc-prop', r.property);
    location.href = '/';
  }

  const activeCount = () => st.tickets.filter(t => t.status !== 'Done').length;
  function shell() {
    const R = ROLES[role()];
    return `<header class="bar"><div class="wrap">
      <div class="bar-top">
        <div class="brand"><small>Stay Santa Rosa</small><div class="brand-row"><h1>${esc(st.property.name)}</h1><span class="portal-tag">${R.label}</span></div></div>
        <div class="who"><span class="uname muted">${esc(st.me.name)}</span>${S.mobile ? `<button class="btn small ghost" data-act="viewMode">${simple() ? 'Full view' : 'Simple view'}</button>` : ''}
          <button class="btn small ghost" data-act="logout">Sign out</button></div>
      </div>
      ${tabsFor().length < 2 ? '' : `<nav class="tabs" role="tablist" aria-label="Sections">${tabsFor().map(t => `<button class="tab" role="tab" data-act="tab" data-v="${t}" aria-selected="${S.tab === t}">${TAB_LABEL[t]}${(t === 'tickets' || t === 'queue') && activeCount() ? `<span class="count">${activeCount()}</span>` : ''}</button>`).join('')}</nav>`}
    </div></header>
    <main class="wrap ${simple() ? 'simple' : ''} ${tabsFor().length < 2 ? 'notabs' : ''}">${canSwitch() ? `<div class="toggle full hotel-toggle" role="group" aria-label="Hotel">${st.properties.map(p => `<button type="button" data-act="${p.id === st.property.id ? 'noop' : 'mgrSwitch'}" data-v="${esc(p.id)}" aria-pressed="${p.id === st.property.id}">${esc(p.name)}</button>`).join('')}</div>` : ''}${({ staff: vStaff, overview: vOverview, rooms: vRooms, tickets: vTickets, queue: vTickets, inspect: vInspect, log: vLog })[S.tab]()}</main>
    ${S.drawer ? drawer() : ''}`;
  }



  function vOverview() {
    const rooms = st.rooms, now = Date.now();
    const open = st.tickets.filter(t => t.status !== 'Done');
    const urgent = open.filter(t => t.priority === 'Urgent');
    const pr = { Urgent: 0, High: 1, Normal: 2, Low: 3 };
    const attn = open.filter(t => t.priority === 'Urgent' || t.priority === 'High' || (!t.assignedTo && now - t.createdAt > DAY) || t.ooo)
      .sort((a, b) => (pr[a.priority] - pr[b.priority]) || (a.createdAt - b.createdAt));
    const byDept = Object.keys(DEPTS).map(k => {
      const o = open.filter(t => t.dept === k);
      return { k, o, open: o.filter(t => t.status === 'Open').length, prog: o.filter(t => t.status === 'In progress').length, hold: o.filter(t => t.status === 'On hold').length,
        un: o.filter(t => !t.assignedTo).length, age: o.length ? Math.round(o.reduce((a, t) => a + (now - t.createdAt), 0) / o.length / DAY * 10) / 10 : 0,
        done7: st.tickets.filter(t => t.dept === k && t.closedAt && now - t.closedAt < 7 * DAY).length };
    });
    const load = ['maintenance', 'housekeeping'].flatMap(k => staffOf(k).map(x => ({ n: x.name, k, c: open.filter(t => t.assignedId === x.id).length })));
    const maxLoad = Math.max(1, ...load.map(l => l.c));
    const last = Object.fromEntries(rooms.map(r => [r, st.inspections.filter(i => i.room === r).reduce((m, i) => Math.max(m, i.at), 0)]));
    const in7 = rooms.filter(r => last[r] && now - last[r] <= 7 * DAY).length, in30 = rooms.filter(r => last[r] && now - last[r] <= 30 * DAY).length;
    const overdue = rooms.filter(r => !last[r] || now - last[r] > 30 * DAY).sort((a, b) => last[a] - last[b]);
    const recent = st.log.slice(0, 8);
    const pct = n => (rooms.length ? Math.round(n / rooms.length * 100) : 0);
    return `<div class="view-head"><div><span class="eyebrow">${esc(st.property.name)} · ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span><h2>Manager overview</h2></div></div>
    <div class="summary">
      <div><b>${byDept[0].o.length}</b><span>Open maintenance</span></div>
      <div><b>${byDept[1].o.length}</b><span>Open housekeeping</span></div>
      <div><b style="color:var(--bad)">${urgent.length}</b><span>Urgent open</span></div>
      <div><b style="color:var(--bad)">${st.oooRooms.length}</b><span>Rooms out of order</span></div>
    </div>
    <div class="ov">
      <section class="panel"><div class="panel-h"><h3>Needs attention</h3><span class="muted" style="font-size:13px">Urgent, high, out of order, or unassigned over 24h</span></div>
        <div class="ov-list">${attn.slice(0, 8).map(t => `<button class="ov-row" data-act="ticket" data-v="${t.id}">${rmCell(t.room)}
          <span class="t">${esc(t.title)}<small>${DEPTS[t.dept]} · ${t.assignedTo ? esc(t.assignedTo) : 'Unassigned'} · ${ago(t.createdAt)}</small></span>
          <span class="actions" style="gap:4px">${t.ooo ? '<span class="pill p-bad">OOO</span>' : ''}${prioPill(t.priority)}</span></button>`).join('') || '<div class="empty">Nothing urgent right now.</div>'}</div></section>
      <section class="panel full-only"><div class="panel-h"><h3>By department</h3><button class="btn small ghost" data-act="tab" data-v="tickets">All tickets</button></div>
        <div class="tbl-wrap"><table><thead><tr><th></th>${byDept.map(b => `<th>${DEPTS[b.k]}</th>`).join('')}</tr></thead><tbody>
        ${[['Open', 'open'], ['In progress', 'prog'], ['On hold', 'hold'], ['Unassigned', 'un'], ['Avg age of open', 'age'], ['Closed last 7 days', 'done7']].map(([l, k]) => `<tr><td class="muted">${l}</td>${byDept.map(b => `<td class="num" ${k === 'un' && b[k] ? 'style="color:var(--warn)"' : ''}>${b[k]}${k === 'age' ? 'd' : ''}</td>`).join('')}</tr>`).join('')}
        </tbody></table></div></section>
      <section class="panel full-only"><div class="panel-h"><h3>Staff workload</h3><span class="muted" style="font-size:13px">Open tickets assigned</span></div>
        <div>${load.map(l => `<div class="load"><span>${esc(l.n)}<br><span class="muted" style="font-size:12px">${DEPTS[l.k]}</span></span><span class="bar"><i style="width:${l.c / maxLoad * 100}%;background:${l.k === 'maintenance' ? 'var(--night)' : 'var(--gold)'}"></i></span><b class="num">${l.c}</b></div>`).join('') || '<div class="empty">Add staff in the Staff tab.</div>'}</div></section>
      <section class="panel"><div class="panel-h"><h3>Turnover inspections</h3><button class="btn small primary" data-act="tab" data-v="inspect">Inspect a room</button></div>
        <div class="meter"><div class="row-between"><span>Inspected in last 7 days</span><b class="num">${in7} of ${rooms.length}</b></div><div class="bar"><i style="width:${pct(in7)}%;background:var(--ok)"></i></div></div>
        <div class="meter"><div class="row-between"><span>Inspected in last 30 days</span><b class="num">${in30} of ${rooms.length}</b></div><div class="bar"><i style="width:${pct(in30)}%;background:var(--ok)"></i></div></div>
        <div class="meter"><span class="muted" style="font-size:13px">Overdue (30+ days)</span><div class="actions">${overdue.slice(0, 16).map(r => `<button class="chip" data-act="room" data-v="${esc(r)}">${esc(r)}</button>`).join('') || '<span class="muted">None</span>'}${overdue.length > 16 ? `<span class="muted">+${overdue.length - 16} more</span>` : ''}</div></div></section>
      ${(() => { const fb = Object.fromEntries(st.inspections.map(i => [i.id, i.fails])); const iss = st.log.filter(l => l.type === 'inspection' && fb[l.insp] > 0).slice(0, 6);
        return `<section class="panel" style="grid-column:1/-1"><div class="panel-h"><h3>Recent inspection issues</h3><span class="muted" style="font-size:13px">Missing items and damage from turnovers</span></div>
        <div class="ov-list">${iss.map(l => `<button class="ov-row" data-act="inspHist" data-v="${esc(l.room)}">${rmCell(l.room)}<span class="t">${esc(l.text.replace(/^Turnover inspection, /, ''))}<small>${esc(l.by)} · ${ago(l.at)}</small></span><span class="pill p-bad">${fb[l.insp]}</span></button>`).join('') || '<div class="empty">No issues found on recent turnovers.</div>'}</div></section>`; })()}
      <section class="panel full-only" style="grid-column:1/-1"><div class="panel-h"><h3>Recent activity</h3><button class="btn small ghost" data-act="tab" data-v="log">Full log</button></div>
        <div class="ov-list">${recent.map(l => `<${l.ticket ? 'button' : 'div'} class="ov-row" ${l.ticket ? `data-act="ticket" data-v="${l.ticket}"` : ''}>${rmCell(l.room)}
          <span class="t">${esc(l.text)}<small>${esc(l.by)}, ${roleLabel(l.role)} · ${ago(l.at)}</small></span>${l.dept ? deptPill(l.dept) : '<span class="pill p-ok">Inspection</span>'}</${l.ticket ? 'button' : 'div'}>`).join('') || '<div class="empty">No activity yet.</div>'}</div></section>
    </div>`;
  }

  function vStaff() {
    const A = S.addStaff || (S.addStaff = { name: '', portal: 'housekeeping', where: st.property.id, pin: '', err: '' });
    const order = Object.keys(ROLES);
    const list = st.staff.slice().sort((a, b) => (b.active - a.active) || order.indexOf(a.portal) - order.indexOf(b.portal) || a.name.localeCompare(b.name));
    const counts = order.map(k => [k, st.staff.filter(x => x.active && x.portal === k).length]);
    const isMe = x => x.id === st.me.id;
    return `<div class="view-head"><div><span class="eyebrow">${esc(st.property.name)} · ${st.staff.filter(x => x.active).length} active logins</span><h2>Staff logins</h2></div></div>
    <form class="panel" data-form="addStaff">
      <div class="panel-h"><h3 style="font-size:15px">Add a staff login</h3><span class="muted" style="font-size:13px">They can sign in right away</span></div>
      <div class="add-staff">
        <label class="f full">Name<input id="as-name" type="text" value="${esc(A.name)}" placeholder="First name and last initial" autocomplete="off" maxlength="60"></label>
        <label class="f">Portal<select id="as-portal">${Object.entries(ROLES).map(([k, r]) => `<option value="${k}" ${A.portal === k ? 'selected' : ''}>${r.label}</option>`).join('')}</select></label>
        <label class="f">Hotel<select id="as-where">${st.properties.map(x => `<option value="${esc(x.id)}" ${A.where === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}${st.properties.length > 1 ? `<option value="both" ${A.where === 'both' ? 'selected' : ''}>Both hotels</option>` : ''}</select></label>
        <label class="f">4-digit PIN<input id="as-pin" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="4" value="${esc(A.pin)}" placeholder="0000" autocomplete="off"></label>
        <button class="btn primary full" type="submit">Add login</button>
      </div>
      ${A.err ? `<p class="err" role="alert" style="padding:0 16px 14px">${esc(A.err)}</p>` : ''}
    </form>
    <div class="chips">${counts.map(([k, c]) => `<span class="pill p-neutral">${ROLES[k].label}: ${c}</span>`).join('')}</div>
    <div class="panel">
      <div class="srow head"><span>Name</span><span>Portal</span><span>Status</span><span>PIN</span><span></span></div>
      ${list.map(x => `<div class="srow ${x.active ? '' : 'off'}">
        <span class="nm">${esc(x.name)}${isMe(x) ? ' (you)' : ''}<small>Added by ${esc(x.addedBy)}, ${new Date(x.addedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</small></span>
        <span class="c-portal">${DEPTS[x.portal] ? deptPill(x.portal) : `<span class="pill p-neutral">${roleLabel(x.portal)}</span>`}</span>
        <span class="c-status">${!x.active ? '<span class="pill p-neutral">Access off</span>' : x.locked ? '<span class="pill p-warn">Locked</span>' : '<span class="pill p-ok">Active</span>'}</span>
        <span class="c-pin">${S.pinEdit === x.id ? `<span class="pin-edit"><input id="pin-${x.id}" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="4" placeholder="New PIN" aria-label="New PIN for ${esc(x.name)}"><button class="btn small primary" data-act="pinSave" data-v="${x.id}">Save</button></span>` : `<span class="muted" style="font-size:14px">${x.locked ? 'Too many wrong tries' : 'PIN set'}</span>`}</span>
        <span class="c-act actions" style="justify-content:flex-end">${S.pinEdit === x.id ? `<button class="btn small ghost" data-act="pinCancel">Cancel</button>` : `<button class="btn small" data-act="pinEdit" data-v="${x.id}">Reset PIN</button>`}
          ${isMe(x) ? '' : `<button class="btn small ${x.active ? 'ghost' : ''}" data-act="staffToggle" data-v="${x.id}" data-on="${x.active ? 0 : 1}">${x.active ? 'Turn off' : 'Turn on'}</button>`}</span>
      </div>`).join('')}
    </div>
    <p class="muted" style="margin:0;font-size:14px">Turning off access keeps the person's name on past tickets and in the log. Resetting a PIN also clears a lockout.</p>`;
  }

  function vRooms() {
    const rooms = st.rooms, info = Object.fromEntries(rooms.map(r => [r, roomInfo(r)]));
    const c = { tk: 0, ooo: 0, due: 0, week: 0 };
    rooms.forEach(r => { const i = info[r]; if (i.open.length) c.tk++; if (i.ooo) c.ooo++; if (i.since === null || i.since > 30) c.due++; if (i.since !== null && i.since <= 7) c.week++; });
    const match = i => S.filter === 'all' || (S.filter === 'tk' && i.open.length) || (S.filter === 'ooo' && i.ooo) || (S.filter === 'due' && (i.since === null || i.since > 30));
    const tkLabel = seesAll() ? 'Rooms with open tickets' : `Rooms with open ${DEPTS[role()].toLowerCase()} tickets`;
    const floors = [...new Set(rooms.map(r => r.slice(0, -2)))].sort((a, b) => b - a);
    return `<div class="view-head"><div><span class="eyebrow">${rooms.length} rooms · tap a room to write a ticket</span><h2>Room status</h2></div>
      <button class="btn" data-act="areaTicket">Property ticket</button>
      <div class="chips scroll">${[['all', 'All'], ['tk', 'Open tickets'], ['ooo', 'Out of order'], ['due', 'Inspection due']].map(([k, l]) => `<button class="chip" data-act="filter" data-v="${k}" aria-pressed="${S.filter === k}">${l}</button>`).join('')}</div></div>
    <div class="summary hide-s">
      <div><b>${c.tk}</b><span>${tkLabel}</span></div>
      <div><b style="color:var(--bad)">${c.ooo}</b><span>Out of order</span></div>
      <div><b style="color:var(--warn)">${c.due}</b><span>Not inspected in 30+ days</span></div>
      <div><b style="color:var(--ok)">${c.week}</b><span>Inspected this week</span></div>
    </div>
    <div class="legend"><span><i style="background:var(--ok)"></i>No issues</span><span><i style="background:var(--info)"></i>Open ticket</span><span><i style="background:var(--bad)"></i>Out of order</span><span><i style="background:var(--warn)"></i>Inspection due</span></div>
    <div class="floors">${floors.map(f => { const fr = rooms.filter(r => r.slice(0, -2) === f); return `<section class="floor"><div class="floor-label"><h3>Floor ${esc(f)}</h3><span class="muted num" style="font-size:13px">${esc(fr[0])} to ${esc(fr[fr.length - 1])}</span></div>
      <div class="grid">${fr.map(r => { const i = info[r]; return `<button class="room s-${i.state} ${match(i) ? '' : 'dim'}" data-act="room" data-v="${esc(r)}" aria-label="Room ${esc(r)}">
        <span class="no">${esc(r)}</span><span class="st"></span><span class="meta">${i.open.length ? `${i.open.length} open` : i.since === null ? 'Not inspected' : `Insp ${i.since}d`}</span></button>`; }).join('')}</div></section>`; }).join('')}
      ${(st.areas || []).length ? `<section class="floor"><div class="floor-label"><h3>Property areas</h3><span class="muted" style="font-size:13px">Lobby, elevator, parking and other spaces</span></div>
        <div class="area-grid">${st.areas.map(a => { const open = st.tickets.filter(t => t.room === a && t.status !== 'Done'); const ooo = st.oooRooms.includes(a); return `<button class="area-tile ${ooo ? 's-ooo' : open.length ? 's-tk' : ''}" data-act="room" data-v="${esc(a)}"><span>${esc(a)}</span><span class="meta">${open.length ? `${open.length} open` : 'No open tickets'}</span></button>`; }).join('')}</div></section>` : ''}</div>`;
  }

  function ticketRows(list) {
    if (!list.length) return '<div class="empty">No tickets here.</div>';
    return list.map(t => `<button class="trow" data-act="ticket" data-v="${t.id}">
      <span class="num c-id muted" style="font-size:13px">${esc(t.code)}</span>${rmCell(t.room)}
      <span class="ttl">${esc(t.title)}<small>${esc(t.reportedBy)}${fieldMode() ? ` · ${ago(t.createdAt)}` : t.assignedTo ? ` · assigned ${esc(t.assignedTo)}` : ' · unassigned'}${t.notes.length ? ` · ${t.notes.length} repl${t.notes.length > 1 ? 'ies' : 'y'}` : ''}</small></span>
      <span class="pls">${seesAll() ? deptPill(t.dept) : '<span></span>'}${prioPill(t.priority)}${statPill(t.status)}</span>
      <span class="muted c-age" style="font-size:12px;text-align:right">${ago(t.createdAt)}</span></button>`).join('');
  }
  function vTickets() {
    if (fieldMode()) {
      const pr = { Urgent: 0, High: 1, Normal: 2, Low: 3 };
      const list = st.tickets.filter(t => t.status !== 'Done').sort((a, b) => (pr[a.priority] - pr[b.priority]) || (a.createdAt - b.createdAt));
      return `<div class="view-head"><div><span class="eyebrow">${esc(st.property.name)} · urgent first</span><h2>Active tickets · ${list.length}</h2></div></div>
      <div class="panel">${list.length ? ticketRows(list) : '<div class="empty">No active tickets. Nice work.</div>'}</div>`;
    }
    const fd = seesAll(), mgr = role() === 'manager', pr = { Urgent: 0, High: 1, Normal: 2, Low: 3 };
    let list = st.tickets.slice();
    const f = S.tFilter;
    if (f === 'active') list = list.filter(t => t.status !== 'Done');
    else if (f === 'mine') list = list.filter(t => t.assignedId === st.me.id && t.status !== 'Done');
    else if (f === 'unassigned') list = list.filter(t => !t.assignedTo && t.status !== 'Done');
    else if (f === 'done') list = list.filter(t => t.status === 'Done');
    else if (DEPTS[f]) list = list.filter(t => t.dept === f && t.status !== 'Done');
    list.sort((a, b) => f === 'done' ? b.closedAt - a.closedAt : (pr[a.priority] - pr[b.priority]) || (a.createdAt - b.createdAt));
    const filters = mgr ? [['active', 'All active'], ['maintenance', 'Maintenance'], ['housekeeping', 'Housekeeping'], ['unassigned', 'Unassigned'], ['done', 'Completed']]
      : fd ? [['active', 'All active'], ['maintenance', 'Maintenance'], ['housekeeping', 'Housekeeping'], ['done', 'Completed']]
      : [['active', 'All active'], ['mine', 'Mine'], ['unassigned', 'Unassigned'], ['done', 'Completed']];
    return `<div class="view-head"><div><span class="eyebrow">${fd ? 'All departments' : DEPTS[role()] + ' tickets only'} · urgent first</span><h2>${fd ? 'Tickets' : DEPTS[role()] + ' queue'}</h2></div>
      <div class="actions"><button class="btn primary" data-act="goRooms">Room ticket</button><button class="btn" data-act="areaTicket">Property ticket</button></div></div>
    <div class="panel"><div class="panel-h"><div class="chips scroll">${filters.map(([k, l]) => `<button class="chip" data-act="tFilter" data-v="${k}" aria-pressed="${f === k}">${l}</button>`).join('')}</div>
      <span class="muted" style="font-size:13px">${list.length} ticket${list.length === 1 ? '' : 's'}</span></div>
    <div>${ticketRows(list)}</div></div>`;
  }

  function vInspect() {
    if (!S.insp) S.insp = { room: '', results: {}, notes: {}, mk: {} };
    const I = S.insp, items = ALL(), done = items.filter(i => I.results[i.id]).length, fails = items.filter(i => I.results[i.id] === 'fail').length, info = I.room ? roomInfo(I.room) : null;
    return `<div class="view-head"><div><span class="eyebrow">${items.length} checks · amenities, cleanliness, damage</span><h2>Turnover inspection</h2></div></div>
    <form class="panel" data-form="insp">
      <div class="sheet-head">
        <label class="f">Room<select id="in-room" data-act="inRoom"><option value="">Select room</option>${st.rooms.map(r => `<option ${I.room === r ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select></label>
        <div class="kv">Inspector<span>${esc(st.me.name)}</span></div>
        <div class="kv">Last inspected<span>${info ? (info.lastIns ? `${fmt(info.lastIns)}, ${esc(info.ins[0].by)}` : 'Never') : 'Pick a room'}</span></div>
        <div class="kv">Open tickets<span>${info ? (info.open.length ? info.open.map(t => esc(t.code)).join(', ') : 'None') : 'Pick a room'}</span></div>
      </div>
      ${st.checklist.map(g => `<div class="group"><h3><span>${esc(g.group)}</span><span class="muted num" style="font-family:var(--ff-body);font-size:13px">${g.items.filter(i => I.results[i.id]).length}/${g.items.length}</span></h3>
        ${g.items.map(it => { const v = I.results[it.id]; return `<div class="item"><span>${esc(it.label)}</span>
          <span class="seg" role="group" aria-label="${esc(it.label)}">${[['pass', 'OK'], ['fail', 'Issue'], ['na', 'N/A']].map(([k, l]) => `<button type="button" data-act="mark" data-item="${it.id}" data-v="${k}" aria-pressed="${v === k}">${l}</button>`).join('')}</span>
          ${v === 'fail' ? `<div class="fail-note one"><input type="text" data-note="${it.id}" value="${esc(I.notes[it.id] || '')}" placeholder="What's missing or wrong? (optional)" maxlength="500"></div>` : ''}
        </div>`; }).join('')}</div>`).join('')}
      <div class="sheet-foot">
        <div style="display:flex;gap:10px;align-items:center;flex:1;min-width:0"><div class="progress"><i style="width:${items.length ? done / items.length * 100 : 0}%"></i></div>
          <span class="num" style="font-size:14px">${done}/${items.length}</span>${fails ? `<span class="pill p-bad">${fails} issue${fails > 1 ? 's' : ''}</span>` : ''}</div>
        <div class="actions"><button type="button" class="btn small" data-act="allPass">Rest OK</button>
        <button type="submit" class="btn small primary" ${I.room && done === items.length ? '' : 'disabled'}>Submit</button></div>
      </div>
    </form>`;
  }

  function vLog() {
    let rows = st.log.slice();
    if (S.logRoom) rows = rows.filter(r => r.room === S.logRoom);
    const failsById = Object.fromEntries(st.inspections.map(i => [i.id, i.fails]));
    if (S.logType) rows = rows.filter(r => S.logType === 'ticket' ? r.type !== 'inspection' : S.logType === 'issues' ? r.type === 'inspection' && failsById[r.insp] > 0 : r.type === 'inspection');
    const shown = rows.slice(0, 150);
    const L = { inspection: ['Inspection', 'p-ok'], open: ['Opened', 'p-info'], update: ['Update', 'p-warn'], comment: ['Comment', 'p-neutral'], close: ['Closed', 'p-ok'] };
    return `<div class="view-head"><div><span class="eyebrow">Newest first · latest 400 events</span><h2>Activity log</h2></div>
      <div class="filters"><select data-act="logRoom" aria-label="Room"><option value="">All rooms and areas</option><optgroup label="Rooms">${st.rooms.map(r => `<option ${S.logRoom === r ? 'selected' : ''}>${esc(r)}</option>`).join('')}</optgroup>${(st.areas || []).length ? `<optgroup label="Property areas">${st.areas.map(r => `<option ${S.logRoom === r ? 'selected' : ''}>${esc(r)}</option>`).join('')}</optgroup>` : ''}</select>
      <select data-act="logType" aria-label="Activity type"><option value="">All activity</option><option value="inspection" ${S.logType === 'inspection' ? 'selected' : ''}>Inspections</option><option value="ticket" ${S.logType === 'ticket' ? 'selected' : ''}>Tickets</option>${role() === 'manager' ? `<option value="issues" ${S.logType === 'issues' ? 'selected' : ''}>Inspection issues</option>` : ''}</select></div></div>
    ${S.logRoom ? (() => { const i = roomInfo(S.logRoom); return `<div class="mini"><div><span class="muted">Last inspected</span><b>${i.lastIns ? ago(i.lastIns) : 'Never'}</b></div><div><span class="muted">Last maintenance</span><b>${i.lastMaint ? ago(i.lastMaint.at) : 'None'}</b></div><div><span class="muted">Open tickets</span><b>${i.open.length}</b></div></div>`; })() : ''}
    <div class="panel tbl-wrap"><table><thead><tr><th>Room</th><th>When</th><th>Activity</th><th>Detail</th><th>By</th></tr></thead><tbody>
      ${shown.map(l => `<tr><td class="rm${isArea(l.room) ? ' area' : ''}">${esc(l.room)}</td><td class="when">${fmt(l.at)}</td><td class="act"><span class="pill ${L[l.type][1]}">${L[l.type][0]}</span></td>
      <td class="det">${l.ticket ? `<button class="linkish" data-act="ticket" data-v="${l.ticket}">${esc(l.text)}</button>` : l.insp && role() === 'manager' ? `<button class="linkish" data-act="inspHist" data-v="${esc(l.room)}">${esc(l.text)}</button>` : esc(l.text)}</td><td class="by muted" style="white-space:nowrap;font-size:14px">${esc(l.by)}, ${roleLabel(l.role)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">No activity yet</td></tr>'}
    </tbody></table>${rows.length > 150 ? `<div class="empty">Showing latest 150 of ${rows.length}</div>` : ''}</div>`;
  }

  function inspDrawer(D) {
    const head = `<div class="scrim" data-act="close"></div><aside class="drawer" role="dialog" aria-modal="true" aria-label="Room ${esc(D.room)} inspections">
      <div class="drawer-h"><div><span class="eyebrow">${esc(st.property.name)} · last 3 kept</span><h2>Room ${esc(D.room)} inspections</h2></div><button class="btn small" data-act="close">Close</button></div><div class="drawer-b">`;
    if (D.err) return head + `<p class="err">${esc(D.err)}</p></div></aside>`;
    if (!D.data) return head + '<div class="loading" style="min-height:30vh"><span><span class="spin"></span>Loading</span></div></div></aside>';
    const sh = D.data.sheets;
    if (!sh.length) return head + '<span class="muted">No turnover inspections saved for this room yet.</span></div></aside>';
    const res = { pass: ['OK', 'p-ok'], fail: ['Issue', 'p-bad'], na: ['N/A', 'p-neutral'] };
    const sel = Math.min(D.sel || 0, sh.length - 1), cur = sh[sel], prev = sh[sel + 1];
    const prevBy = prev ? Object.fromEntries(prev.items.map(x => [x.label, x.result])) : {};
    const changed = cur.items.filter(x => x.result === 'fail' && prevBy[x.label] === 'pass');
    const groups = [...new Set(cur.items.map(x => x.grp))];
    return head + `<div class="toggle full" role="group" aria-label="Inspection">${sh.map((x, k) => `<button type="button" data-act="inspSel" data-v="${k}" aria-pressed="${k === sel}">${new Date(x.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}${x.issues ? ` · ${x.issues}` : ''}</button>`).join('')}</div>
      <div class="muted" style="font-size:14px">${fmt(cur.at)} · ${esc(cur.by)} · ${cur.issues ? `${cur.issues} issue${cur.issues > 1 ? 's' : ''}` : 'all OK'}</div>
      ${prev ? (changed.length ? `<div class="changed"><span class="eyebrow" style="color:var(--bad)">OK on ${new Date(prev.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, now an issue</span>${changed.map(x => `<div><b>${esc(x.label)}</b>${x.note ? ` · ${esc(x.note)}` : ''}</div>`).join('')}</div>`
        : `<div class="muted" style="font-size:13px">Nothing newly missing or damaged since ${new Date(prev.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.</div>`) : ''}
      <div class="panel">${groups.map(g => `<div class="group"><h3><span>${esc(g)}</span></h3>${cur.items.filter(x => x.grp === g).map(x => `<div class="item sheet-row"><span>${esc(x.label)}${x.note ? `<small class="muted" style="display:block">${esc(x.note)}</small>` : ''}</span><span class="pill ${res[x.result][1]}">${res[x.result][0]}</span></div>`).join('')}</div>`).join('')}</div>
    </div></aside>`;
  }

  function drawer() {
    const D = S.drawer;
    if (D.type === 'insp') return inspDrawer(D);
    if (D.type === 'room') {
      const r = D.id, i = roomInfo(r);
      const feed = i.tk.slice().sort((a, b) => (a.status === 'Done') - (b.status === 'Done') || b.createdAt - a.createdAt);
      return `<div class="scrim" data-act="close"></div><aside class="drawer" role="dialog" aria-modal="true" aria-label="${esc(where(r))}">
        <div class="drawer-h"><div><span class="eyebrow">${esc(st.property.name)} · ${isArea(r) ? 'Property ticket' : `Floor ${esc(r.slice(0, -2))}`}</span><h2>${esc(where(r))}</h2></div><button class="btn small" data-act="close">Close</button></div>
        <div class="drawer-b">
          <form class="composer" data-form="comment">
            ${isArea(r) ? `<label class="f">Where<select id="cm-area">${st.areas.map(a => `<option ${a === r ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select></label>` : ''}
            <div class="f" style="display:grid;gap:6px;font-size:12px;font-weight:500;letter-spacing:var(--track-caps);text-transform:uppercase;color:var(--muted)">Send to
              <div class="toggle full" role="group" aria-label="Department">${Object.entries(DEPTS).map(([k, l]) => `<button type="button" data-act="cmDept" data-v="${k}" aria-pressed="${S.cmDept === k}">${l}</button>`).join('')}</div></div>
            <label class="f" for="cm-body">What needs attention?<textarea id="cm-body" required maxlength="2000" placeholder="Describe the issue ${isArea(r) ? `at ${esc(r.toLowerCase())}` : `in room ${esc(r)}`}">${esc(S.cmDraft)}</textarea></label>
            <div class="row-between">
              <div class="chips" role="group" aria-label="Priority">${PRIORITIES.map(p => `<button type="button" class="chip" data-act="cmPrio" data-v="${p}" aria-pressed="${S.cmPrio === p}">${p}</button>`).join('')}</div>
              <label class="check"><input id="cm-ooo" type="checkbox" ${S.cmOoo ? 'checked' : ''}> Out of order</label>
            </div>
            <div class="row-between"><span class="muted" style="font-size:13px">Posting as ${esc(st.me.name)} · opens a new ${DEPTS[S.cmDept].toLowerCase()} ticket</span><button class="btn primary" type="submit">Submit ticket</button></div>
          </form>
          ${isArea(r) ? '' : `<div class="mini">
            <div><span class="muted">Last inspected</span><b>${i.lastIns ? ago(i.lastIns) : 'Never'}</b></div>
            <div><span class="muted">Last maintenance</span><b>${i.lastMaint ? ago(i.lastMaint.at) : 'None'}</b></div>
            <div><span class="muted">Open</span><b>${i.open.length}${i.ooo ? ' · <span style="color:var(--bad)">OOO</span>' : ''}</b></div>
          </div>`}
          <div class="actions">${role() !== 'frontdesk' && !isArea(r) ? `<button class="btn small" data-act="inspectRoom" data-v="${esc(r)}">Turnover inspection</button>` : ''}${role() === 'manager' && !isArea(r) && i.ins.length ? `<button class="btn small" data-act="inspHist" data-v="${esc(r)}">Last ${Math.min(3, i.ins.length)} inspections</button>` : ''}${simple() ? '' : `<button class="btn small ghost" data-act="logFor" data-v="${esc(r)}">${isArea(r) ? 'Area log' : 'Room log'}</button>`}</div>
          <div style="display:grid;gap:10px"><span class="eyebrow">${seesAll() ? 'All tickets' : DEPTS[role()] + ' tickets'} for ${isArea(r) ? esc(r.toLowerCase()) : 'this room'} · ${feed.length}</span>
            <div class="feed">${feed.map(t => `<button class="cmt" data-act="ticket" data-v="${t.id}">
              <div class="cmt-h"><b>${esc(t.reportedBy)}</b><span class="muted">${roleLabel(t.reportedRole)} · ${fmt(t.createdAt)}</span></div>
              <p>${esc(t.desc)}</p>
              <div class="cmt-f"><span class="num muted" style="font-size:12px">${esc(t.code)}</span>${seesAll() ? deptPill(t.dept) : ''}${prioPill(t.priority)}${statPill(t.status)}${t.notes.length ? `<span class="muted" style="font-size:13px">${t.notes.length} repl${t.notes.length > 1 ? 'ies' : 'y'}</span>` : ''}</div>
            </button>`).join('') || `<span class="muted">No tickets for ${isArea(r) ? 'this area' : 'this room'} yet.</span>`}</div></div>
        </div></aside>`;
    }
    const t = findTicket(D.id); if (!t) return '';
    const work = role() === t.dept || role() === 'manager';
    return `<div class="scrim" data-act="close"></div><aside class="drawer" role="dialog" aria-modal="true" aria-label="Ticket ${esc(t.code)}">
      <div class="drawer-h"><div><span class="eyebrow">${esc(t.code)} · ${esc(where(t.room))}</span><h2>${esc(t.title)}</h2></div><button class="btn small" data-act="close">Close</button></div>
      <div class="drawer-b">
        <div class="actions">${deptPill(t.dept)}${prioPill(t.priority)}${statPill(t.status)}<span class="pill p-neutral">${esc(t.category)}</span>${t.ooo ? '<span class="pill p-bad">Out of order</span>' : ''}</div>
        <div class="muted" style="font-size:14px">${fieldMode() ? `Reported ${ago(t.createdAt)}` : t.assignedTo ? `Assigned to ${esc(t.assignedTo)}` : 'Unassigned'}${t.closedAt ? ` · closed ${fmt(t.closedAt)}` : ''}</div>
        <div class="feed">
          <div class="cmt"><div class="cmt-h"><b>${esc(t.reportedBy)}</b><span class="muted">${roleLabel(t.reportedRole)} · ${fmt(t.createdAt)}</span></div><p>${esc(t.desc)}</p></div>
          ${t.notes.map(n => `<div class="cmt reply ${n.change ? 'upd' : ''}"><div class="cmt-h"><b>${esc(n.by)}</b><span class="muted">${roleLabel(n.role)} · ${fmt(n.at)}</span></div>${n.change ? `<span class="eyebrow" style="color:var(--accent)">${esc(n.change)}</span>` : ''}${n.text ? `<p>${esc(n.text)}</p>` : ''}</div>`).join('')}
        </div>
        ${work && fieldMode() ? `<form class="composer" data-form="mcomment">
          <label class="f">Comment<textarea id="up-note" maxlength="2000" placeholder="What you found, what you did, parts needed"></textarea></label>
          <div class="quick"><button type="submit" class="btn">Post comment</button>${t.status !== 'Done' ? `<button type="button" class="btn primary" data-act="quick" data-v="done">Mark done</button>` : `<button type="button" class="btn" data-act="quick" data-v="reopen">Reopen</button>`}</div>
          <span class="muted" style="font-size:13px">Mark done also saves anything typed in the comment box.</span></form>`
        : work ? `<form class="composer" data-form="update">
          ${simple() ? `<div class="quick">${role() === 'housekeeping' && t.assignedId !== st.me.id && t.status !== 'Done' ? `<button type="button" class="btn" data-act="quick" data-v="take">Take it</button>` : ''}${t.status !== 'Done' ? `<button type="button" class="btn primary" data-act="quick" data-v="done" ${role() !== 'housekeeping' || t.assignedId === st.me.id ? 'style="grid-column:1/-1"' : ''}>Mark done</button>` : `<button type="button" class="btn" data-act="quick" data-v="reopen" style="grid-column:1/-1">Reopen</button>`}</div>` : ''}
          <label class="f">Comment or update<textarea id="up-note" maxlength="2000" placeholder="What you found, what you did, what's next"></textarea></label>
          ${simple() ? '<details class="more"><summary>More fields</summary>' : ''}
          <div class="form-grid">
            <label class="f">Status<select id="up-status">${STATUSES.map(s => `<option ${t.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
            <label class="f">Assigned to<select id="up-assign"><option value="">Unassigned</option>${staffOf(t.dept).map(x => `<option value="${x.id}" ${t.assignedId === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
            <label class="f">Priority<select id="up-prio">${PRIORITIES.map(p => `<option ${t.priority === p ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
            <label class="f">Category<select id="up-cat">${CATS[t.dept].map(c => `<option ${t.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
            <label class="f">Department<select id="up-dept">${Object.entries(DEPTS).map(([k, l]) => `<option value="${k}" ${t.dept === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
            <label class="check" style="align-self:end"><input id="up-ooo" type="checkbox" ${t.ooo ? 'checked' : ''}> Room out of order</label>
          </div>
          ${simple() ? '</details>' : ''}
          <div class="row-between"><span class="muted" style="font-size:13px">${role() === 'manager' ? 'Posting as manager. ' : ''}Adds to this ticket. No new ticket is created.</span><button class="btn primary" type="submit">Post update</button></div></form>`
        : `<div class="panel" style="padding:16px;display:grid;gap:10px;background:var(--band)"><span class="muted" style="font-size:14px">Front Desk comments open a new ticket. ${DEPTS[t.dept]} posts updates here.</span><div><button class="btn" data-act="room" data-v="${esc(t.room)}">New ticket for ${esc(isArea(t.room) ? t.room.toLowerCase() : 'room ' + t.room)}</button></div></div>`}
      </div></aside>`;
  }

  /* ---------- Actions ---------- */
  async function run(fn, btn) {
    if (busy) return; busy = true; if (btn) btn.setAttribute('aria-busy', 'true');
    try { await fn(); } catch (e) { if (e.message !== 'Signed out') S.toast = e.message; }
    finally { busy = false; render(); }
  }
  async function sendUpdate(t, fields, note) {
    const r = await api(`/api/tickets/${t.id}`, { method: 'POST', body: { comment: note, ...fields } });
    await reload();
    if (r.moved) { S.drawer = null; S.toast = `${r.code} moved to ${DEPTS[r.department]}`; }
    else if (fieldMode() && fields.status === 'Done') { S.drawer = null; S.toast = `${r.code} marked done`; }
    else S.toast = fields.status ? `${r.code} updated` : `${r.code}: comment posted`;
  }
  function openRoom(r) { S.drawer = { type: 'room', id: r }; S.cmDraft = ''; S.cmPrio = 'Normal'; S.cmOoo = false; S.cmDept = 'maintenance'; S.focusCm = true; }

  function onClick(e) {
    const b = e.target.closest('[data-act]'); if (!b || b.tagName === 'SELECT') return;
    const a = b.dataset.act, v = b.dataset.v;
    switch (a) {
      case 'tab': S.tab = v; S.drawer = null; window.scrollTo(0, 0); break;
      case 'filter': S.filter = v; break;
      case 'tFilter': S.tFilter = v; break;
      case 'room': openRoom(v); break;
      case 'ticket': if (!findTicket(v)) { S.toast = 'That ticket belongs to another department or has been archived.'; break; } S.drawer = { type: 'ticket', id: v }; break;
      case 'close': S.drawer = null; break;
      case 'logout': return run(async () => { await api('/api/logout', { method: 'POST' }); location.href = '/login'; });
      case 'mgrSwitch': return run(async () => { const r = await api('/api/switch-property', { method: 'POST', body: { property: v } }); S.drawer = null; S.insp = null; S.logRoom = ''; S.addStaff = null; await reload(); ls.set('rc-prop', st.property.id); S.toast = `Now at ${r.property}`; }, b);
      case 'pinEdit': S.pinEdit = +v; break;
      case 'pinCancel': S.pinEdit = null; break;
      case 'pinSave': {
        const val = document.getElementById('pin-' + v).value;
        if (!/^\d{4}$/.test(val)) { S.toast = 'PIN must be 4 digits'; break; }
        return run(async () => { const r = await api(`/api/staff/${v}`, { method: 'PATCH', body: { pin: val } }); S.pinEdit = null; await reload(); S.toast = r.message; }, b);
      }
      case 'staffToggle': return run(async () => { const r = await api(`/api/staff/${v}`, { method: 'PATCH', body: { active: b.dataset.on === '1' } }); await reload(); S.toast = r.message; }, b);
      case 'viewMode': S.forceFull = !S.forceFull; S.drawer = null; S.toast = simple() ? 'Simple view: core sections only' : 'Full view: all sections'; break;
      case 'quick': {
        const t = findTicket(S.drawer.id), note = (document.getElementById('up-note')?.value || '').trim(), f = {};
        if (v === 'take') { f.assignedId = st.me.id; if (t.status === 'Open' || t.status === 'On hold') f.status = 'In progress'; }
        else if (v === 'done') f.status = 'Done';
        else if (v === 'reopen') f.status = 'Open';
        return run(() => sendUpdate(t, f, note), b);
      }
      case 'goRooms': S.tab = 'rooms'; S.filter = 'all'; S.toast = 'Tap a room to write its ticket'; break;
      case 'areaTicket': if (!(st.areas || []).length) { S.toast = 'No property areas set up yet. Run the property-areas SQL update.'; break; } openRoom(st.areas[0]); break;
      case 'noop': return;
      case 'inspHist': {
        const room = v; S.drawer = { type: 'insp', room, data: null, sel: 0 }; render();
        api(`/api/inspections?room=${encodeURIComponent(room)}`).then(d => { if (S.drawer?.type === 'insp' && S.drawer.room === room) { S.drawer.data = d; render(); } })
          .catch(e => { if (S.drawer?.type === 'insp') { S.drawer.err = e.message; render(); } });
        return;
      }
      case 'inspSel': S.drawer.sel = +v; break;
      case 'notMe': ls.set('rc-name', ''); S.loginErr = ''; S.lgName = ''; render(); document.getElementById('lg-name')?.focus(); return;
      case 'loginBack': S.choose = null; S.loginErr = ''; break;
      case 'pickPortal': return run(() => doLogin({ name: S.nameHold, pin: S.pinHold, staffId: Number(v) }), b);
      case 'cmPrio': S.cmPrio = v; break;
      case 'cmDept': S.cmDept = v; break;
      case 'inspectRoom': S.insp = { room: v, results: {}, notes: {}, mk: {} }; S.tab = 'inspect'; S.drawer = null; break;
      case 'logFor': S.logRoom = v; S.logType = ''; S.tab = 'log'; S.drawer = null; break;
      case 'mark': { const it = b.dataset.item; S.insp.results[it] = S.insp.results[it] === v ? undefined : v; break; }
      case 'allPass': ALL().forEach(i => { if (!S.insp.results[i.id]) S.insp.results[i.id] = 'pass'; }); break;
      default: return;
    }
    render();
  }
  function onChange(e) {
    const el = e.target;
    const refocus = id => document.getElementById(id)?.focus();
    if (el.id === 'lg-remember') { S.lgRemember = el.checked; }
    else if (el.dataset.act === 'inRoom') { S.insp.room = el.value; render(); }
    else if (el.dataset.act === 'logRoom') { S.logRoom = el.value; render(); }
    else if (el.dataset.act === 'logType') { S.logType = el.value; render(); }
    else if (el.dataset.mk) { S.insp.mk[el.dataset.mk] = el.checked; }
    else if (el.id === 'cm-ooo') { S.cmOoo = el.checked; }
    else if (el.id === 'cm-area' && S.drawer) { S.drawer.id = el.value; render(); }
    else if (el.id === 'as-portal' && S.addStaff) { S.addStaff.portal = el.value; if (el.value === 'maintenance' && st.properties.length > 1) { S.addStaff.where = 'both'; render(); } }
    else if (el.id === 'as-where' && S.addStaff) { S.addStaff.where = el.value; }
  }
  function onInput(e) {
    const id = e.target.id;
    if (S.addStaff && (id === 'as-name' || id === 'as-pin')) S.addStaff[id === 'as-name' ? 'name' : 'pin'] = e.target.value;
    if (id === 'cm-body') S.cmDraft = e.target.value;
    if (id === 'lg-name') S.lgName = e.target.value;
    if (id === 'lg-pin') { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4); if (e.target.value.length === 4 && (ls.get('rc-name') || document.getElementById('lg-name')?.value.trim())) e.target.form.requestSubmit(); }
    if (e.target.dataset.note) S.insp.notes[e.target.dataset.note] = e.target.value;
  }
  function onKey(e) { if (e.key === 'Escape' && S.drawer) { S.drawer = null; render(); } }
  function onSubmit(e) {
    e.preventDefault();
    const f = e.target.dataset.form, $ = id => document.getElementById(id), btn = e.target.querySelector('button[type=submit]');
    if (f === 'login') {
      const name = ls.get('rc-name') || ($('lg-name')?.value || '').trim(), pin = $('lg-pin').value;
      S.lgName = $('lg-name')?.value || S.lgName;
      if (!name) { S.loginErr = 'Enter your name.'; render(); $('lg-name')?.focus(); return; }
      if (!/^\d{4}$/.test(pin)) { S.loginErr = 'Enter your 4-digit PIN.'; render(); $('lg-pin')?.focus(); return; }
      S.pinHold = pin; S.nameHold = name;
      return run(() => doLogin({ name, pin }), btn).then(() => { if (!S.choose) $('lg-pin')?.focus(); });
    }
    if (f === 'comment') {
      const body = $('cm-body').value.trim(); if (!body) return;
      return run(async () => {
        const r = await api('/api/tickets', { method: 'POST', body: { room: S.drawer.id, department: S.cmDept, body, priority: S.cmPrio, outOfOrder: S.cmOoo, category: guessCat(S.cmDept, body) } });
        S.cmDraft = ''; S.cmPrio = 'Normal'; S.cmOoo = false; S.focusCm = true;
        await reload(); S.toast = `${r.code} sent to ${DEPTS[r.department]}`;
      }, btn);
    }
    if (f === 'insp') {
      const I = S.insp; if (!I.room) return;
      const results = ALL().map(i => ({ itemId: i.id, result: I.results[i.id], note: I.notes[i.id] || '' }));
      return run(async () => {
        const r = await api('/api/inspections', { method: 'POST', body: { room: I.room, results } });
        S.toast = `Room ${I.room} turnover saved${r.issues ? `, ${r.issues} issue${r.issues > 1 ? 's' : ''} noted` : ', all OK'}`;
        S.insp = null; await reload();
      }, btn);
    }
    if (f === 'mcomment') {
      const t = findTicket(S.drawer.id), note = $('up-note').value.trim();
      if (!note) { S.toast = 'Write a comment first'; render(); return; }
      return run(() => sendUpdate(t, {}, note), btn);
    }
    if (f === 'update') {
      const t = findTicket(S.drawer.id), note = $('up-note').value.trim();
      const fields = { status: $('up-status').value, assignedId: $('up-assign').value ? Number($('up-assign').value) : null, priority: $('up-prio').value, category: $('up-cat').value, department: $('up-dept').value, outOfOrder: $('up-ooo').checked };
      return run(() => sendUpdate(t, fields, note), btn);
    }
    if (f === 'addStaff') {
      const A = S.addStaff;
      A.name = $('as-name').value.trim(); A.pin = $('as-pin').value.trim(); A.portal = $('as-portal').value; A.where = $('as-where').value; A.err = '';
      if (!A.name) { A.err = 'Enter a name.'; return render(); }
      if (!/^\d{4}$/.test(A.pin)) { A.err = 'PIN must be exactly 4 digits.'; return render(); }
      return run(async () => {
        try { const r = await api('/api/staff', { method: 'POST', body: { name: A.name, portal: A.portal, where: A.where, pin: A.pin } }); S.addStaff = null; await reload(); S.toast = r.message; }
        catch (err) { A.err = err.message; }
      }, btn);
    }
  }

  app.addEventListener('click', onClick);
  app.addEventListener('change', onChange);
  app.addEventListener('input', onInput);
  app.addEventListener('submit', onSubmit);
  document.addEventListener('keydown', onKey);

  // Keep the board fresh: quiet refresh every 60s while nobody is typing or in a panel.
  function poll() {
    pollTimer = setTimeout(async () => {
      const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '');
      if (mode === 'app' && st && !busy && !S.drawer && S.tab !== 'inspect' && S.tab !== 'staff' && !typing && document.visibilityState === 'visible') {
        try { await reload(); render(); } catch (e) {}
      }
      if (alive) poll();
    }, 60000);
  }

  // Refresh as soon as someone comes back to the app (phone unlocked, tab switched back).
  async function onVisible() {
    if (document.visibilityState !== 'visible' || busy || !alive) return;
    const typing = /INPUT|TEXTAREA/.test(document.activeElement?.tagName || '');
    try {
      if (mode === 'login') return;
      if (st && !S.drawer && S.tab !== 'inspect' && !typing) { await reload(); render(); }
    } catch (e) {}
  }
  document.addEventListener('visibilitychange', onVisible);

  (async () => {
    try {
      if (mode !== 'login') { await reload(); S.tab = tabsFor()[0]; poll(); }
    } catch (e) {
      if (e.message === 'Signed out') return;
      app.innerHTML = `<div class="loading"><span>${esc(e.message)} <button class="btn small" onclick="location.reload()">Retry</button></span></div>`;
      return;
    }
    render();
  })();

  return () => {
    alive = false; clearTimeout(pollTimer); clearTimeout(toastTimer);
    app.removeEventListener('click', onClick); app.removeEventListener('change', onChange);
    app.removeEventListener('input', onInput); app.removeEventListener('submit', onSubmit);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onVisible);
    try { MQ.removeEventListener('change', onMQ); } catch (e) {}
  };
}
