# Room Care: Stay Santa Rosa staff portal

Maintenance and housekeeping tickets, room inspections and an activity log for **Hotel E** and **Art House**.
It is built to live at a private address such as `staff.staysantarosa.com`. It is hidden from search engines, and every page needs a staff PIN.

## What's inside

| Path | What it is |
|---|---|
| `supabase/schema.sql` | Database tables, rooms, inspection checklist and the first manager login. RLS is disabled. |
| `middleware.js` | Sends anyone without a valid session to the PIN screen, for every page and every data request. |
| `app/api/*` | Server routes. These are the only code that talks to Supabase. The key never reaches the browser. |
| `components/engine.js` | The app interface: login, rooms, tickets, inspections, log, manager overview and staff. |
| `app/globals.css` | Styling copied from staysantarosa.com. |
| `next.config.js`, `public/robots.txt`, `app/layout.js` | Keep the site out of Google: a `noindex` header on every response, a `Disallow: /` robots file, and a robots meta tag. |

## Setup (about 20 minutes)

### 1. Supabase
1. Create a Supabase project, or use an existing one.
2. Open `supabase/schema.sql`. Near the bottom, change the first manager's **name** (`'Daniel W.'`) and **PIN** (`'2580'`).
3. In Supabase, go to **SQL Editor**, open a new query, paste the whole file, and click **Run**.
4. Go to **Project Settings > API** and copy the **Project URL** and the **service_role** key. Do not use the anon key.

### 2. GitHub and Vercel
1. Push this folder to a new private GitHub repo.
2. In Vercel, choose **Add New > Project**, import the repo, and keep the framework as Next.js.
3. Before deploying, open **Environment Variables** and add these three:
   - `SUPABASE_URL`: the Project URL
   - `SUPABASE_SERVICE_ROLE_KEY`: the service_role key
   - `SESSION_SECRET`: a long random string. To make one, run `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`

   Never add `NEXT_PUBLIC_` to any of these names. That prefix would send the value to the browser.
4. Click **Deploy**.

### 3. Domain
1. In the Vercel project, go to **Settings > Domains** and add `staff.staysantarosa.com`.
2. At your DNS provider, add the CNAME record that Vercel shows you.
3. Don't link to this address from the public site. Staff can save it to their phone's home screen.

### 4. First sign-in
1. Open the site and choose your hotel, then **Manager**, then your name, then enter your PIN.
2. Go to **Staff** and add everyone else, choosing a name, portal, hotel (or both) and a 4-digit PIN.

## Check that it's locked down
```bash
curl -sI https://staff.staysantarosa.com/login | grep -i x-robots   # expect: noindex, nofollow...
curl -s  https://staff.staysantarosa.com/api/state                  # expect: {"error":"Please sign in."}
curl -s  https://staff.staysantarosa.com/robots.txt                 # expect: Disallow: /
```

## How the security works
- **PIN check.** PINs are stored as bcrypt hashes and checked on the server. After 5 wrong tries, that login is locked for 15 minutes. A manager can clear the lock by resetting the PIN.
- **Session.** A correct PIN sets a signed, HTTP-only cookie that lasts 12 hours, so staff sign in once per shift.
- **Every request is re-checked.** Each data request confirms the person's login is still active. Turning someone off in the Staff tab locks them out immediately.
- **Role checks on the server.** Maintenance and Housekeeping only receive their own department's tickets. Only managers can add staff or switch hotels.
- **RLS is disabled, as specified.** Instead, the schema removes all table access from Supabase's public `anon` and `authenticated` roles. Only the server key in Vercel can read or write.

## Everyday changes
- **Edit the inspection checklist.** In Supabase, go to **Table Editor > checklist_items**. Change labels or `sort`, or set `active = false` to retire an item. Changes appear in the app immediately.
- **Add a hotel.** Insert a row into `properties` and its rooms into `rooms`.
- **Hold staff accountable.** Every ticket, comment, status change and inspection is saved with the staff member and time, in `ticket_comments` and `activity_log`.

## Local development
```bash
cp .env.example .env.local   # fill in the three values
npm install
npm run dev                  # http://localhost:3000
```
