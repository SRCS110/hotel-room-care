import { db, q, setupHint } from '@/lib/db';
import { json, fail, requireSession, sameOrigin } from '@/lib/session';
import { getProperty, getRoom, logEvent, code, clean } from '@/lib/data';
import { DEPTS, PRIORITIES, CATS, guessCat } from '@/lib/constants';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

// A room comment always opens a new ticket under the signed-in person.
export async function POST(req) {
  if (!sameOrigin(req)) return fail('Bad request.', 400);
  const s = await requireSession(); if (s.error) return s.error;
  try {
    const b = await req.json();
    const body = clean(b.body);
    if (!body) return fail('Write what needs attention first.');
    if (!DEPTS[b.department]) return fail('Choose Maintenance or Housekeeping.');
    const priority = PRIORITIES.includes(b.priority) ? b.priority : 'Normal';
    const category = CATS[b.department].includes(b.category) ? b.category : guessCat(b.department, body);
    const [prop, room] = await Promise.all([getProperty(s.property), getRoom(s.property, b.room)]);
    if (!room) return fail('Unknown room.', 404);
    const title = clean(body.split('\n')[0], 80);
    const [t] = await q(db().from('tickets').insert({
      room_id: room.id, department: b.department, title, body, category, priority,
      out_of_order: !!b.outOfOrder, reported_by: s.me.id
    }).select('id'));
    const c = code(prop.prefix, t.id);
    await logEvent({ room_id: room.id, kind: 'open', department: b.department, staff_id: s.me.id, ticket_id: t.id, summary: `${c} opened: ${title}` });
    return json({ ok: true, code: c, department: b.department });
  } catch (e) { console.error(e); return fail(`Could not save the ticket. ${setupHint(e)}`, 500); }
}
