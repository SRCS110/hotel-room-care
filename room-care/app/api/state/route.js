import { db, q, setupHint } from '@/lib/db';
import { json, fail, requireSession } from '@/lib/session';
import { getProperty, code } from '@/lib/data';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;
const DAY = 864e5;
const ms = t => (t ? new Date(t).getTime() : null);

// Everything the signed-in person is allowed to see for the current hotel.
export async function GET() {
  const s = await requireSession(); if (s.error) return s.error;
  const { me, property } = s;
  const seesAll = me.portal === 'frontdesk' || me.portal === 'manager';
  try {
    const prop = await getProperty(property);
    if (!prop) return fail('Unknown hotel.', 404);
    const [properties, rooms, staffAll, checklist] = await Promise.all([
      q(db().from('properties').select('id,name').order('name')),
      q(db().from('rooms').select('id,number,floor,kind').eq('property_id', prop.id).order('floor').order('number')),
      q(db().from('staff').select('id,name,portal,property_id,active,locked_until,created_at,created_by')),
      q(db().from('checklist_items').select('id,grp,label,sort').eq('active', true).order('sort'))
    ]);
    const roomIds = rooms.map(r => r.id);
    const roomNo = Object.fromEntries(rooms.map(r => [r.id, r.number]));
    const staffById = Object.fromEntries(staffAll.map(x => [x.id, x]));
    const nm = id => staffById[id]?.name || 'Former staff';
    const role = id => staffById[id]?.portal || '';

    let tq = db().from('tickets')
      .select('id,room_id,department,title,body,category,priority,status,out_of_order,reported_by,assigned_to,created_at,updated_at,closed_at,ticket_comments(id,staff_id,body,change_summary,created_at)')
      .in('room_id', roomIds)
      .or(`status.neq.Done,closed_at.gte.${new Date(Date.now() - 60 * DAY).toISOString()}`)
      .order('created_at', { ascending: false }).limit(1000);
    if (!seesAll) tq = tq.eq('department', me.portal);
    // Out-of-order flags are room status, so every portal sees them even on other departments' tickets.
    const oooQ = db().from('tickets').select('room_id').in('room_id', roomIds).eq('out_of_order', true).neq('status', 'Done');
    const iq = db().from('inspections').select('id,room_id,staff_id,completed_at,fail_count')
      .in('room_id', roomIds).gte('completed_at', new Date(Date.now() - 400 * DAY).toISOString())
      .order('completed_at', { ascending: false }).limit(3000);
    let lq = db().from('activity_log').select('id,room_id,kind,department,staff_id,ticket_id,summary,created_at')
      .in('room_id', roomIds).order('created_at', { ascending: false }).limit(400);
    if (!seesAll) lq = lq.or(`department.is.null,department.eq.${me.portal}`);
    const [tickets, ooo, inspections, log] = await Promise.all([q(tq), q(oooQ), q(iq), q(lq)]);

    const groups = [];
    checklist.forEach(c => { let g = groups.find(x => x.group === c.grp); if (!g) groups.push(g = { group: c.grp, items: [] }); g.items.push({ id: c.id, label: c.label }); });

    return json({
      me: { id: me.id, name: me.name, portal: me.portal },
      property: { id: prop.id, name: prop.name, prefix: prop.prefix, perFloor: prop.per_floor },
      properties,
      rooms: rooms.filter(r => r.kind !== 'area').map(r => r.number),
      areas: rooms.filter(r => r.kind === 'area').map(r => r.number),
      oooRooms: [...new Set(ooo.map(o => roomNo[o.room_id]))],
      checklist: groups,
      staff: staffAll.filter(x => x.property_id === prop.id && (me.portal === 'manager' || x.active)).map(x => ({
        id: x.id, name: x.name, portal: x.portal, active: x.active,
        locked: !!(x.locked_until && new Date(x.locked_until) > new Date()),
        addedBy: x.created_by ? nm(x.created_by) : 'Setup', addedAt: ms(x.created_at)
      })),
      tickets: tickets.map(t => ({
        id: t.id, code: code(prop.prefix, t.id), dept: t.department, room: roomNo[t.room_id], title: t.title, desc: t.body,
        category: t.category, priority: t.priority, status: t.status, ooo: t.out_of_order,
        reportedBy: nm(t.reported_by), reportedRole: role(t.reported_by),
        assignedId: t.assigned_to, assignedTo: t.assigned_to ? nm(t.assigned_to) : '',
        createdAt: ms(t.created_at), updatedAt: ms(t.updated_at), closedAt: ms(t.closed_at),
        notes: (t.ticket_comments || []).sort((a, b) => ms(a.created_at) - ms(b.created_at))
          .map(c => ({ at: ms(c.created_at), by: nm(c.staff_id), role: role(c.staff_id), text: c.body || '', change: c.change_summary || '' }))
      })),
      inspections: inspections.map(i => ({ room: roomNo[i.room_id], at: ms(i.completed_at), by: nm(i.staff_id), fails: i.fail_count })),
      log: log.map(l => ({ at: ms(l.created_at), room: roomNo[l.room_id], type: l.kind, by: nm(l.staff_id), role: role(l.staff_id), text: l.summary, ticket: l.ticket_id, dept: l.department }))
    });
  } catch (e) { console.error(e); return fail(`Could not load data. ${setupHint(e)}`, 500); }
}
