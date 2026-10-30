import { db, q, setupHint } from '@/lib/db';
import { json, fail, requireSession, sameOrigin } from '@/lib/session';
import { getRoom, logEvent, clean } from '@/lib/data';

const KEEP = 3; // full sheets kept per room

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

// Submit a turnover inspection. Records what was missing or wrong; tickets are filed from the Rooms page.
export async function POST(req) {
  if (!sameOrigin(req)) return fail('Bad request.', 400);
  const s = await requireSession(['maintenance', 'housekeeping', 'manager']); if (s.error) return s.error;
  try {
    const b = await req.json();
    const [room, items] = await Promise.all([
      getRoom(s.property, b.room),
      q(db().from('checklist_items').select('id,label').eq('active', true))
    ]);
    if (!room || room.kind === 'area') return fail('Pick a guest room first.', 404);
    const byId = Object.fromEntries(items.map(i => [i.id, i]));
    const results = (Array.isArray(b.results) ? b.results : []).filter(r => byId[r.itemId] && ['pass', 'fail', 'na'].includes(r.result));
    if (results.length !== items.length) return fail('Mark every item before submitting.');
    const issues = results.filter(r => r.result === 'fail');

    const [ins] = await q(db().from('inspections').insert({ room_id: room.id, staff_id: s.me.id, fail_count: issues.length }).select('id'));
    await q(db().from('inspection_results').insert(results.map(r => ({ inspection_id: ins.id, item_id: r.itemId, result: r.result, note: clean(r.note, 500) || null }))));

    const list = issues.map(r => { const n = clean(r.note, 80); return byId[r.itemId].label + (n ? ` (${n})` : ''); });
    const summary = issues.length
      ? `Turnover inspection, ${issues.length} issue${issues.length === 1 ? '' : 's'}: ${list.join('; ')}`.slice(0, 600)
      : 'Turnover inspection, all OK';
    await logEvent({ room_id: room.id, kind: 'inspection', staff_id: s.me.id, inspection_id: ins.id, summary });
    await prune(room.id);
    return json({ ok: true, issues: issues.length });
  } catch (e) { console.error(e); return fail(`Could not save the inspection. ${setupHint(e)}`, 500); }
}

// Keep only the latest KEEP sheets for a room (results cascade; tickets keep their text).
async function prune(roomId) {
  const all = await q(db().from('inspections').select('id').eq('room_id', roomId).order('completed_at', { ascending: false }).order('id', { ascending: false }));
  const old = all.slice(KEEP).map(r => r.id);
  if (!old.length) return;
  await q(db().from('activity_log').delete().in('inspection_id', old));
  await q(db().from('inspections').delete().in('id', old));
}

// The saved sheets for one room, newest first.
// Managers only: staff record inspections but don't review the history.
export async function GET(req) {
  const s = await requireSession(['manager']); if (s.error) return s.error;
  try {
    const roomNo = new URL(req.url).searchParams.get('room');
    const room = await getRoom(s.property, roomNo);
    if (!room || room.kind === 'area') return fail('Pick a guest room.', 404);
    const ins = await q(db().from('inspections')
      .select('id,completed_at,fail_count,staff(name),inspection_results(result,note,checklist_items(grp,label,sort))')
      .eq('room_id', room.id).order('completed_at', { ascending: false }).limit(KEEP));
    return json({
      room: room.number,
      sheets: ins.map(i => ({
        id: i.id, at: new Date(i.completed_at).getTime(), by: i.staff?.name || 'Former staff', issues: i.fail_count,
        items: (i.inspection_results || []).filter(r => r.checklist_items)
          .map(r => ({ grp: r.checklist_items.grp, label: r.checklist_items.label, sort: r.checklist_items.sort, result: r.result, note: r.note || '' }))
          .sort((a, b) => a.sort - b.sort)
      }))
    });
  } catch (e) { console.error(e); return fail(`Could not load inspections. ${setupHint(e)}`, 500); }
}
