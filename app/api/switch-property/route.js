import { json, fail, requireSession, newSessionToken, setSessionCookie, sameOrigin } from '@/lib/session';
import { getProperty } from '@/lib/data';

export const dynamic = 'force-dynamic';

// Managers can look at either hotel.
export async function POST(req) {
  if (!sameOrigin(req)) return fail('Bad request.', 400);
  const s = await requireSession(['manager']); if (s.error) return s.error;
  const { property } = await req.json();
  const p = await getProperty(property);
  if (!p) return fail('Unknown hotel.', 404);
  const res = json({ ok: true, property: p.name });
  return setSessionCookie(res, await newSessionToken(s.me, p.id));
}
