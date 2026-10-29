import bcrypt from 'bcryptjs';
import { db, q, setupHint } from '@/lib/db';
import { json, fail, newSessionToken, setSessionCookie, sameOrigin } from '@/lib/session';
import { ROLES, MAX_PIN_TRIES, LOCK_MINUTES } from '@/lib/constants';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

// "Daniel W." == "daniel w" == "Daniel  W"
const norm = s => String(s || '').toLowerCase().replace(/[.\s]+/g, ' ').trim();
const NOPE = "That name and PIN don't match. Check both and try again.";

// One sign-in screen: name + PIN. The account decides the portal and hotel.
export async function POST(req) {
  if (!sameOrigin(req)) return fail('Bad request.', 400);
  try {
    const { name, pin, staffId, preferredProperty } = await req.json();
    if (!norm(name)) return fail('Enter your name.', 400);
    if (!/^\d{4}$/.test(String(pin || ''))) return fail('Enter your 4-digit PIN.', 400);

    const all = await q(db().from('staff').select('id,name,portal,property_id,pin_hash,failed_attempts,locked_until,properties(name)').eq('active', true));
    const rows = all.filter(r => norm(r.name) === norm(name));
    if (!rows.length) return fail(NOPE, 401);

    const now = new Date();
    const open = rows.filter(r => !(r.locked_until && new Date(r.locked_until) > now));
    if (!open.length) {
      const until = Math.min(...rows.map(r => new Date(r.locked_until).getTime()));
      const mins = Math.max(1, Math.ceil((until - now) / 60000));
      return fail(`Too many wrong PINs. Try again in ${mins} minute${mins === 1 ? '' : 's'}, or ask a manager to reset your PIN.`, 429);
    }

    const matches = [];
    for (const r of open) if (await bcrypt.compare(String(pin), r.pin_hash)) matches.push(r);

    if (!matches.length) {
      let left = MAX_PIN_TRIES;
      for (const r of open) {
        const tries = (r.failed_attempts || 0) + 1, lock = tries >= MAX_PIN_TRIES;
        left = Math.min(left, MAX_PIN_TRIES - tries);
        await q(db().from('staff').update({ failed_attempts: lock ? 0 : tries, locked_until: lock ? new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() : null }).eq('id', r.id));
      }
      return fail(left <= 0 ? `Too many wrong PINs. This login is locked for ${LOCK_MINUTES} minutes.` : `${NOPE} ${left} ${left === 1 ? 'try' : 'tries'} left.`, 401);
    }

    for (const r of matches) await q(db().from('staff').update({ failed_attempts: 0, locked_until: null }).eq('id', r.id));

    // Same name + PIN in more than one portal (rare): ask which one.
    let pick = staffId ? matches.find(r => r.id === Number(staffId)) : null;
    const portals = [...new Set(matches.map(r => r.portal))];
    if (!pick && portals.length > 1) {
      const order = Object.keys(ROLES);
      return json({ choose: portals.sort((a, b) => order.indexOf(b) - order.indexOf(a)).map(p => {
        const r = matches.find(m => m.portal === p && m.property_id === preferredProperty) || matches.find(m => m.portal === p);
        return { staffId: r.id, portal: p, label: ROLES[p].label };
      }) });
    }
    // One portal, possibly at both hotels: open the hotel they used last.
    if (!pick) pick = matches.find(r => r.property_id === preferredProperty) || matches.sort((a, b) => (a.properties?.name || '').localeCompare(b.properties?.name || ''))[0];

    const res = json({ ok: true, name: pick.name, portal: pick.portal, property: pick.property_id });
    return setSessionCookie(res, await newSessionToken(pick, pick.property_id));
  } catch (e) { console.error(e); return fail(`Sign-in failed. ${setupHint(e)}`, 500); }
}
