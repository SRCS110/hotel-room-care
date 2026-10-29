import { db, q, setupHint } from '@/lib/db';
import { json, fail, requireSession, sameOrigin } from '@/lib/session';
import { getProperty, getRoom, logEvent, code, clean } from '@/lib/data';
import { guessCat } from '@/lib/constants';

export const dynamic = 'force-dynamic';

// Submit a completed inspection sheet. Failed items can open maintenance tickets.
export async function POST(req) {
  if (!sameOrigin(req)) return fail('Bad request.', 400);
  const s = await requireSession(['maintenance', 'housekeeping', 'manager']); if (s.error) return s.error;
  try {
    const b = await req.json();
    const [prop, room, items] = await Promise.all([
      getProperty(s.property), getRoom(s.property, b.room),
      q(db().from('checklist_items').select('id,label').eq('active', true))
    ]);
    if (!room) return fail('Pick a room first.', 404);
    const byId = Object.fromEntries(items.map(i => [i.id, i]));
    const results = (Array.isArray(b.results) ? b.results : []).filter(r => byId[r.itemId] && ['pass', 'fail', 'na'].includes(r.result));
    if (results.length !== items.length) return fail('Mark every item before submitting.');
    const fails = results.filter(r => r.result === 'fail');

    const [ins] = await q(db().from('inspections').insert({ room_id: room.id, staff_id: s.me.id, fail_count: fails.length }).select('id'));
    await q(db().from('inspection_results').insert(results.map(r => ({ inspection_id: ins.id, item_id: r.itemId, result: r.result, note: clean(r.note, 500) || null }))));
    await logEvent({ room_id: room.id, kind: 'inspection', staff_id: s.me.id, inspection_id: ins.id, summary: `Inspection completed, ${fails.length} issue${fails.length === 1 ? '' : 's'}` });

    let opened = 0;
    for (const f of fails.filter(f => f.makeTicket !== false)) {
      const label = byId[f.itemId].label, note = clean(f.note, 500);
      const body = `${label}${note ? ': ' + note : ''} (from inspection)`;
      const title = `${label}${note ? ': ' + note : ''}`.slice(0, 80);
      const [t] = await q(db().from('tickets').insert({
        room_id: room.id, department: 'maintenance', title, body, category: guessCat('maintenance', label),
        priority: /smoke|lock/i.test(label) ? 'High' : 'Normal', reported_by: s.me.id, inspection_id: ins.id
      }).select('id'));
      await logEvent({ room_id: room.id, kind: 'open', department: 'maintenance', staff_id: s.me.id, ticket_id: t.id, summary: `${code(prop.prefix, t.id)} opened: ${title}` });
      opened++;
    }
    return json({ ok: true, fails: fails.length, opened });
  } catch (e) { console.error(e); return fail(`Could not save the inspection. ${setupHint(e)}`, 500); }
}
