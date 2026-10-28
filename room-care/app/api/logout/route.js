import { json } from '@/lib/session';
import { SESSION_COOKIE } from '@/lib/constants';

export async function POST() {
  const res = json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
}
