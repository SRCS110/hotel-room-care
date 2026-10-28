import bcrypt from 'bcryptjs';
import { db, q } from '@/lib/db';
import { json, fail, newSessionToken, setSessionCookie, sameOrigin } from '@/lib/session';
import { MAX_PIN_TRIES, LOCK_MINUTES } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  if (!sameOrigin(req)) return fail('Bad request.', 400);
  try {
    const { staffId, pin } = await req.json();
    if (!staffId || !/^\d{4}$/.test(String(pin || ''))) return fail('Enter your 4-digit PIN.', 400);
    const rows = await q(db().from('staff').select('id,name,portal,property_id,pin_hash,active,failed_attempts,locked_until').eq('id', Number(staffId)).limit(1));
    const s = rows[0];
    if (!s || !s.active) return fail('That login is not active. Ask a manager.', 401);

    if (s.locked_until && new Date(s.locked_until) > new Date()) {
      const mins = Math.ceil((new Date(s.locked_until) - Date.now()) / 60000);
      return fail(`Too many wrong PINs. Try again in ${mins} minute${mins === 1 ? '' : 's'}, or ask a manager to reset it.`, 429);
    }

    const ok = await bcrypt.compare(String(pin), s.pin_hash);
    if (!ok) {
      const tries = (s.failed_attempts || 0) + 1;
      const lock = tries >= MAX_PIN_TRIES;
      await q(db().from('staff').update({
        failed_attempts: lock ? 0 : tries,
        locked_until: lock ? new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() : null
      }).eq('id', s.id));
      return fail(lock ? `Too many wrong PINs. This login is locked for ${LOCK_MINUTES} minutes.` : `That PIN doesn't match. ${MAX_PIN_TRIES - tries} tries left.`, 401);
    }

    await q(db().from('staff').update({ failed_attempts: 0, locked_until: null }).eq('id', s.id));
    const res = json({ ok: true });
    return setSessionCookie(res, await newSessionToken(s, s.property_id));
  } catch (e) { console.error(e); return fail('Sign-in failed. Try again.', 500); }
}
