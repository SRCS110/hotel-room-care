import 'server-only';
import { db, q } from './db';

export const code = (prefix, id) => `${prefix}-${1000 + Number(id)}`;

export async function getProperty(id) {
  const rows = await q(db().from('properties').select('id,name,prefix,per_floor').eq('id', id).limit(1));
  return rows[0] || null;
}
export async function getRoom(propertyId, number) {
  const rows = await q(db().from('rooms').select('id,number,kind').eq('property_id', propertyId).eq('number', String(number)).limit(1));
  return rows[0] || null;
}
export async function logEvent(row) {
  await q(db().from('activity_log').insert(row));
}
export const clean = (s, max = 2000) => String(s ?? '').replace(/\u0000/g, '').trim().slice(0, max);
export const isPin = p => /^\d{4}$/.test(String(p ?? ''));
