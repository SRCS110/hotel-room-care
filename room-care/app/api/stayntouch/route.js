import crypto from 'crypto';
import { db, q } from '@/lib/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

const KEEP = 5000;          // newest messages kept
const MAX_BYTES = 200_000;  // ignore anything larger

// Stayntouch's exact signature header isn't documented to us yet, so accept an HMAC-SHA256
// of the raw body (hex or base64, with or without "sha256=") in any header that looks like a signature.
function verify(raw, headers) {
  const secret = (process.env.STAYNTOUCH_WEBHOOK_SECRET || '').trim();
  if (!secret) return false;
  const mac = crypto.createHmac('sha256', secret).update(raw);
  const d = mac.digest(), hex = d.toString('hex'), b64 = d.toString('base64');
  for (const [k, v] of Object.entries(headers)) {
    if (!/sign|hmac/i.test(k)) continue;
    for (const part of String(v).split(/[,\s]+/)) {
      const val = part.replace(/^(sha256|v1)=/i, '').trim();
      if (!val) continue;
      for (const want of [hex, b64]) {
        const a = Buffer.from(val), b = Buffer.from(want);
        if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
      }
    }
  }
  return false;
}

export async function POST(req) {
  const raw = await req.text();
  if (raw.length > MAX_BYTES) return NextResponse.json({ ok: false }, { status: 413 });
  const headers = {};
  req.headers.forEach((v, k) => { if (!/cookie|authorization/i.test(k)) headers[k] = v; });
  let payload; try { payload = JSON.parse(raw); } catch { payload = { raw: raw.slice(0, 5000) }; }
  const event = payload?.event || payload?.event_type || payload?.type || payload?.action || headers['x-event'] || headers['x-event-type'] || null;
  try {
    await q(db().from('stayntouch_events').insert({ verified: verify(raw, headers), event: event ? String(event).slice(0, 120) : null, headers, payload }));
    // Trim old messages occasionally
    if (Math.random() < 0.05) {
      const cut = await q(db().from('stayntouch_events').select('id').order('id', { ascending: false }).range(KEEP, KEEP));
      if (cut[0]) await q(db().from('stayntouch_events').delete().lte('id', cut[0].id));
    }
  } catch (e) { console.error('stayntouch webhook', e); }
  // Always acknowledge so Stayntouch doesn't retry or disable the webhook.
  return NextResponse.json({ ok: true });
}

// Lets you (or Stayntouch) confirm the address is reachable.
export async function GET() { return NextResponse.json({ ok: true, service: 'Room Care webhook receiver' }); }
