// Edge-safe session token helpers (used by middleware and server routes).
import { SignJWT, jwtVerify } from 'jose';
import { SESSION_HOURS } from './constants';

const key = () => {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET must be set to at least 32 characters');
  return new TextEncoder().encode(s);
};

export async function signSession(payload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(key());
}

export async function readToken(token) {
  if (!token) return null;
  try { const { payload } = await jwtVerify(token, key(), { algorithms: ['HS256'] }); return payload; }
  catch { return null; }
}
