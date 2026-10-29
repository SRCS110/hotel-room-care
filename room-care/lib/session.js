import 'server-only';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { db, q, setupHint } from './db';
import { readToken, signSession } from './token';
import { SESSION_COOKIE, SESSION_HOURS } from './constants';

export const json = (body, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export const fail = (message, status = 400) => json({ error: message }, status);

export function setSessionCookie(res, token) {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: SESSION_HOURS * 3600
  });
  return res;
}
export const newSessionToken = (staff, property) => signSession({ sid: String(staff.id), prop: property });

// Every API route calls this. It re-checks the database on each request, so
// turning someone's access off takes effect immediately, not when the cookie expires.
export async function requireSession(roles) {
  let payload, rows;
  try {
    payload = await readToken(cookies().get(SESSION_COOKIE)?.value);
    if (!payload?.sid) return { error: fail('Please sign in again.', 401) };
    rows = await q(db().from('staff').select('id,name,portal,property_id,active').eq('id', Number(payload.sid)).limit(1));
  } catch (e) { console.error(e); return { error: fail(`Could not check your sign-in. ${setupHint(e)}`, 500) }; }
  const me = rows[0];
  if (!me || !me.active) return { error: fail('Your access has been turned off. Ask a manager.', 401) };
  // Only managers may view a property other than their own.
  const property = me.portal === 'manager' ? payload.prop : me.property_id;
  if (roles && !roles.includes(me.portal)) return { error: fail('Your portal cannot do that.', 403) };
  return { me, property };
}

// Reject cross-site form posts (defense in depth on top of SameSite=strict).
export function sameOrigin(req) {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.get('host'); } catch { return false; }
}
