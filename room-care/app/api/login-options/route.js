import { db, q, setupHint } from '@/lib/db';
import { json, fail } from '@/lib/session';

export const dynamic = 'force-dynamic';

// Feeds the sign-in dropdowns: hotels, then portals, then active staff names.
export async function GET() {
  try {
    const [properties, staff] = await Promise.all([
      q(db().from('properties').select('id,name').order('name')),
      q(db().from('staff').select('id,name,portal,property_id').eq('active', true).order('name'))
    ]);
    return json({ properties, staff });
  } catch (e) { console.error(e); return fail(`Could not load sign-in options. ${setupHint(e)}`, 500); }
}
