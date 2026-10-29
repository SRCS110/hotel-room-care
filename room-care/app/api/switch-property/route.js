import { db, q, setupHint } from '@/lib/db';
import { json, fail, requireSession, newSessionToken, setSessionCookie, sameOrigin } from '@/lib/session';
import { getProperty } from '@/lib/data';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

// Managers and Maintenance work across both hotels and can switch between them.
export async function POST(req) {
  if (!sameOrigin(req)) return fail('Bad request.', 400);
  const s = await requireSession(['manager', 'maintenance']); if (s.error) return s.error;
  try {
    const { property } = await req.json();
    const p = await getProperty(property);
    if (!p) return fail('Unknown hotel.', 404);
    if (s.me.portal === 'manager') {
      return setSessionCookie(json({ ok: true, property: p.name }), await newSessionToken(s.me, p.id));
    }
    // Maintenance: use this person's login at the other hotel, so tickets they take
    // are assigned to the right hotel's record. Create it (same name and PIN) if missing.
    const rows = await q(db().from('staff').select('id,active').eq('property_id', p.id).eq('portal', 'maintenance').eq('name', s.me.name).limit(1));
    let target = rows[0];
    if (target && !target.active) return fail(`Your ${p.name} login is turned off. Ask a manager.`, 403);
    if (!target) {
      const mine = await q(db().from('staff').select('pin_hash').eq('id', s.me.id).limit(1));
      [target] = await q(db().from('staff').insert({ property_id: p.id, name: s.me.name, portal: 'maintenance', pin_hash: mine[0].pin_hash, created_by: s.me.id }).select('id'));
    }
    return setSessionCookie(json({ ok: true, property: p.name }), await newSessionToken({ id: target.id }, p.id));
  } catch (e) { console.error(e); return fail(`Could not switch hotels. ${setupHint(e)}`, 500); }
}
