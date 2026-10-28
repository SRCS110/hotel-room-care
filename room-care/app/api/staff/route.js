import bcrypt from 'bcryptjs';
import { db, q } from '@/lib/db';
import { json, fail, requireSession, sameOrigin } from '@/lib/session';
import { clean, isPin } from '@/lib/data';
import { ROLES } from '@/lib/constants';

export const dynamic = 'force-dynamic';

// Managers add staff logins at one hotel or both.
export async function POST(req) {
  if (!sameOrigin(req)) return fail('Bad request.', 400);
  const s = await requireSession(['manager']); if (s.error) return s.error;
  try {
    const b = await req.json();
    const name = clean(b.name, 60).replace(/\s+/g, ' ');
    if (!name) return fail('Enter a name.');
    if (!ROLES[b.portal]) return fail('Choose a portal.');
    if (!isPin(b.pin)) return fail('PIN must be exactly 4 digits.');
    const props = b.where === 'both' ? (await q(db().from('properties').select('id,name'))) : (await q(db().from('properties').select('id,name').eq('id', b.where)));
    if (!props.length) return fail('Choose a hotel.');
    const existing = await q(db().from('staff').select('property_id,name').eq('portal', b.portal).in('property_id', props.map(p => p.id)));
    const dup = existing.find(x => x.name.toLowerCase() === name.toLowerCase());
    if (dup) return fail(`${name} already has a ${ROLES[b.portal].label} login at ${props.find(p => p.id === dup.property_id).name}. Turn it back on or reset the PIN instead.`, 409);
    const pin_hash = await bcrypt.hash(String(b.pin), 10);
    await q(db().from('staff').insert(props.map(p => ({ property_id: p.id, name, portal: b.portal, pin_hash, created_by: s.me.id }))));
    return json({ ok: true, message: `${name} added to ${ROLES[b.portal].label} at ${props.map(p => p.name).join(' and ')}` });
  } catch (e) { console.error(e); return fail('Could not add that login.', 500); }
}
