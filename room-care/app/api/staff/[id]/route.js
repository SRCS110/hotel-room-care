import bcrypt from 'bcryptjs';
import { db, q, setupHint } from '@/lib/db';
import { json, fail, requireSession, sameOrigin } from '@/lib/session';
import { isPin } from '@/lib/data';

export const dynamic = 'force-dynamic';

// Managers reset a PIN or turn a login on/off.
export async function PATCH(req, { params }) {
  if (!sameOrigin(req)) return fail('Bad request.', 400);
  const s = await requireSession(['manager']); if (s.error) return s.error;
  try {
    const id = Number(params.id);
    const rows = await q(db().from('staff').select('id,name,property_id').eq('id', id).limit(1));
    const x = rows[0];
    if (!x || x.property_id !== s.property) return fail('Staff member not found.', 404);
    const b = await req.json();
    if (b.pin !== undefined) {
      if (!isPin(b.pin)) return fail('PIN must be exactly 4 digits.');
      await q(db().from('staff').update({ pin_hash: await bcrypt.hash(String(b.pin), 10), failed_attempts: 0, locked_until: null }).eq('id', id));
      return json({ ok: true, message: `PIN reset for ${x.name}` });
    }
    if (typeof b.active === 'boolean') {
      if (id === s.me.id && !b.active) return fail("You can't turn off your own login.");
      await q(db().from('staff').update({ active: b.active }).eq('id', id));
      return json({ ok: true, message: `${x.name}: access ${b.active ? 'on' : 'off'}` });
    }
    return fail('Nothing to change.');
  } catch (e) { console.error(e); return fail(`Could not save that change. ${setupHint(e)}`, 500); }
}
