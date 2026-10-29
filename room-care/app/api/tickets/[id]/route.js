import { db, q, setupHint } from '@/lib/db';
import { json, fail, requireSession, sameOrigin } from '@/lib/session';
import { getProperty, logEvent, code, clean } from '@/lib/data';
import { DEPTS, PRIORITIES, STATUSES, CATS, guessCat } from '@/lib/constants';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

// Comment on / update an existing ticket. Allowed for the ticket's own department and managers.
export async function POST(req, { params }) {
  if (!sameOrigin(req)) return fail('Bad request.', 400);
  const s = await requireSession(['maintenance', 'housekeeping', 'manager']); if (s.error) return s.error;
  try {
    const id = Number(params.id);
    const rows = await q(db().from('tickets').select('*, rooms!inner(id,property_id,number)').eq('id', id).limit(1));
    const t = rows[0];
    if (!t || t.rooms.property_id !== s.property) return fail('Ticket not found.', 404);
    if (s.me.portal !== 'manager' && s.me.portal !== t.department) return fail('This ticket belongs to another department.', 403);

    const b = await req.json();
    const note = clean(b.comment);
    const nv = {
      status: STATUSES.includes(b.status) ? b.status : t.status,
      assigned_to: b.assignedId === undefined ? t.assigned_to : (b.assignedId ? Number(b.assignedId) : null),
      priority: PRIORITIES.includes(b.priority) ? b.priority : t.priority,
      department: DEPTS[b.department] ? b.department : t.department,
      out_of_order: typeof b.outOfOrder === 'boolean' ? b.outOfOrder : t.out_of_order
    };
    nv.category = CATS[nv.department].includes(b.category) ? b.category : t.category;

    let assigneeName = '';
    if (nv.assigned_to && nv.assigned_to !== t.assigned_to) {
      const a = await q(db().from('staff').select('id,name,portal,property_id,active').eq('id', nv.assigned_to).limit(1));
      if (!a[0] || !a[0].active || a[0].portal !== nv.department || a[0].property_id !== s.property) return fail('Pick someone from that department.');
      assigneeName = a[0].name;
    }

    const ch = [];
    if (nv.status !== t.status) ch.push(`Status: ${nv.status}`);
    if (nv.assigned_to !== t.assigned_to) ch.push(nv.assigned_to ? `Assigned: ${assigneeName}` : 'Unassigned');
    if (nv.priority !== t.priority) ch.push(`Priority: ${nv.priority}`);
    if (nv.category !== t.category) ch.push(`Category: ${nv.category}`);
    if (nv.out_of_order !== t.out_of_order) ch.push(nv.out_of_order ? 'Room out of order' : 'Room back in order');
    const moved = nv.department !== t.department;
    if (moved) { ch.push(`Moved to ${DEPTS[nv.department]}`); nv.assigned_to = null; nv.category = guessCat(nv.department, t.body); }
    if (!note && !ch.length) return fail('Write a comment or change a field first.');

    if (nv.status === 'Done') nv.out_of_order = false;
    const now = new Date().toISOString();
    const closing = nv.status === 'Done' && t.status !== 'Done';
    await q(db().from('tickets').update({ ...nv, updated_at: now, closed_at: nv.status === 'Done' ? (t.closed_at || now) : null }).eq('id', id));
    await q(db().from('ticket_comments').insert({ ticket_id: id, staff_id: s.me.id, body: note || null, change_summary: ch.join(' · ') || null }));

    const prop = await getProperty(s.property);
    const c = code(prop.prefix, id);
    const quote = note ? `: "${note.slice(0, 60)}${note.length > 60 ? '…' : ''}"` : '';
    if (closing) await logEvent({ room_id: t.room_id, kind: 'close', department: nv.department, staff_id: s.me.id, ticket_id: id, summary: `${c} closed: ${t.title}` });
    if (!closing || ch.length > 1 || note)
      await logEvent({ room_id: t.room_id, kind: ch.length ? 'update' : 'comment', department: nv.department, staff_id: s.me.id, ticket_id: id, summary: `${c} ${ch.length ? ch.join(', ') : 'comment'}${quote}` });

    return json({ ok: true, code: c, moved, department: nv.department });
  } catch (e) { console.error(e); return fail(`Could not save the update. ${setupHint(e)}`, 500); }
}
