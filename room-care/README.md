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

## Updating an existing install
- **Oct 30 update (turnover inspection and inspection history):** run `supabase/migrations/003_turnover_inspection.sql`, then `supabase/migrations/004_inspection_history.sql`, once each in the Supabase SQL Editor. Then deploy the new code.
- **Oct 29 update (property tickets and the Maintenance hotel toggle):** run `supabase/migrations/002_property_areas.sql` once in the Supabase SQL Editor, then deploy the new code. A fresh install doesn't need this, because `schema.sql` already includes it.

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
1. Open the site, type your name exactly as it appears in `schema.sql` (capitals and periods don't matter), and enter your PIN.
2. Go to **Staff** and add everyone else, choosing a name, portal, hotel (or both) and a 4-digit PIN.

## Check that it's locked down
```bash
curl -sI https://staff.staysantarosa.com/login | grep -i x-robots   # expect: noindex, nofollow...
curl -s  https://staff.staysantarosa.com/api/state                  # expect: {"error":"Please sign in."}
curl -s  https://staff.staysantarosa.com/robots.txt                 # expect: Disallow: /
```

## How sign-in works
- There's one screen: **your name and a 4-digit PIN**. The account decides the portal and the hotel, and opens that person's dashboard: Overview for managers, Queue for Maintenance and Housekeeping, Rooms for Front Desk.
- **Remember my name on this device** is on by default. Next time, the screen says "Welcome back, Maria L." and only asks for the PIN, which signs in as soon as the 4th digit is entered. **Not you?** clears the saved name.
- Staff who work at both hotels open the hotel they used last.
- If a person has the same name and PIN in two portals, they're asked which dashboard to open.
- No staff names are shown before sign-in.

## Maintenance on a phone
On a phone, Maintenance sees a single screen: the active tickets for the current hotel, urgent first, with the hotel toggle above. Opening a ticket gives two actions: **Post comment** and **Mark done**. Mark done also saves anything typed in the comment box. There's no accepting or assigning tickets. **Full view** in the header still opens Rooms, Inspect and Log if needed.

## Turnover inspections
- The Turnover tab has 26 checks in four groups: **Linens & amenities** (robes, extra blanket, pillows, towels, hangers, hair dryer, iron, coffee, toiletries, remote), **Works & present**, **Clean** and **Damage**. Each check is marked OK, Issue or N/A, and an issue can have a short note.
- Inspections don't create tickets. File tickets from the Rooms page.
- **Who sees what:** Housekeeping, Maintenance and managers can record turnovers. Only **managers** can see the history, the issue details, the **Inspection issues** filter in the Log, and the **Recent inspection issues** panel on the Overview. The server enforces this. Other portals' logs only show "Turnover inspection completed".
- **History:** every completed sheet is saved item by item. Open it from the room panel (**Last 3 inspections**) or by tapping an inspection in the Log. The viewer flags anything that was OK on the previous sheet and is now an issue, which makes it easy to tell what went missing during a stay.
- **Storage:** only the latest **3** sheets per room are kept. Older ones are deleted automatically when a new one is submitted. Tickets that came from an old sheet are kept.
- **Edit the checklist** in Supabase under Table Editor > checklist_items. Set `active = false` to retire an item.

## How the security works
- **PIN check.** PINs are stored as bcrypt hashes and checked on the server. After 5 wrong tries, that login is locked for 15 minutes. A manager can clear the lock by resetting the PIN.
- **Session.** A correct PIN sets a signed, HTTP-only cookie that lasts 12 hours, so staff sign in once per shift.
- **Every request is re-checked.** Each data request confirms the person's login is still active. Turning someone off in the Staff tab locks them out immediately.
- **Role checks on the server.** Maintenance and Housekeeping only receive their own department's tickets. Only managers can add staff or switch hotels.
- **RLS is disabled, as specified.** Instead, the schema removes all table access from Supabase's public `anon` and `authenticated` roles. Only the server key in Vercel can read or write.

## Everyday changes
- **Change the property areas.** In Supabase, go to **Table Editor > rooms** and filter `kind = area`. Rename, add or delete rows for each hotel, using `floor = 0` and `kind = area`. Only delete areas that have no tickets yet.
- **Maintenance at both hotels.** Maintenance staff switch hotels with the toggle at the top of every screen. If someone doesn't have a login at the other hotel yet, it's created automatically with the same name and PIN. A PIN reset applies at both hotels.
- **Edit the inspection checklist.** In Supabase, go to **Table Editor > checklist_items**. Change labels or `sort`, or set `active = false` to retire an item. Changes appear in the app immediately.
- **Add a hotel.** Insert a row into `properties` and its rooms into `rooms`.
- **Hold staff accountable.** Every ticket, comment, status change and inspection is saved with the staff member and time, in `ticket_comments` and `activity_log`.

## Local development
```bash
cp .env.example .env.local   # fill in the three values
npm install
npm run dev                  # http://localhost:3000
```
