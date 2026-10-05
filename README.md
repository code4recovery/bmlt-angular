# bmlt-angular

An Angular take on [tsml-ui](https://github.com/code4recovery/tsml-ui): a meeting finder for
[BMLT](https://bmlt.app/) root servers and 12 Step Meeting List / Meeting Guide JSON feeds, with
filtering by **day**, **time**, **type**, **region**, **attendance** (in person / online), and
free-text search.

## Requirements

Angular 22 needs **Node.js 22.22.3+ or 24.15+** (or 26+) and TypeScript 6.0.

## Run it

```bash
git clone https://github.com/code4recovery/bmlt-angular.git
cd bmlt-angular
npm install
npm start          # http://localhost:4200
npm run build      # production build in dist/bmlt-ang/browser
```

## NA / BMLT deployment

This build is configured for the Southern California NA BMLT feed on todayna.org

- **Feed:** `src/app/settings.ts` → `feedFormat: 'bmlt'`, `feedUrl` = the todayna.org
  `GetSearchResults` URL. The app appends `get_used_formats=1` so meeting-type labels come from
  the server's own format list (falls back to built-in NA labels in `models/bmlt.ts`).
- **Adapter:** `src/app/models/bmlt.ts` converts BMLT records to the Meeting Guide shape:
  - `weekday_tinyint` 1–7 → day 0–6
  - `start_time` + `duration_time` → end time
  - `venue_type` 1/2/3 → in person / online / hybrid
  - `formats` → types
  - city → region
  - `service_body_name` → service area
  - `virtual_meeting_link` / `phone_meeting_number` → join links
- **Base path:** `angular.json` production config sets `baseHref: "/na/"`.
- **Fallback:** if the browser can't load todayna.org directly (CORS, outage), the app retries
  `/na/feed.json`, which `deploy/nginx-na.conf` proxies and caches.

### Deploy

```bash
./deploy/deploy.sh                        # builds and rsyncs to /na
sudo cp deploy/nginx-na.conf /etc/nginx/snippets/
# add `include snippets/nginx-na.conf;` to the server block,
# plus the proxy_cache_path line from the top of that file at http level
sudo nginx -t && sudo systemctl reload nginx
```

To update a deployed copy later:

```bash
git pull && ./deploy/deploy.sh
```

For local dev (`npm start`) the base is `/`, so it runs at http://localhost:4200 as before.

## Point it at your feed

Edit `src/app/settings.ts`.

For a BMLT root server:

```ts
feedFormat: 'bmlt',
feedUrl: 'https://your-server.org/main_server/client_interface/json/?switcher=GetSearchResults&services[]=123',
```

If you host somewhere other than `/na/`, change `baseHref` in `angular.json` (or build with
`ng build --base-href /your-path/`) and update the paths in `deploy/`.

## How it maps to tsml-ui

| tsml-ui | bmlt-angular |
| --- | --- |
| Filters in the query string (`?day=1&type=O,D`) | Same — the URL is the single source of truth, so links and the back button work |
| Defaults to today | `defaultDay: 'today'` (or `'any'`) in settings |
| Time windows: morning / midday / evening / night / appointment | Same windows (`models/meeting-types.ts`) |
| Type filter shows only types present in the feed | Same; multiple types are AND-ed |
| Attendance: in person / online, hybrid matches both | Same rules (`models/normalize.ts`) |
| Table: Time, Name, Location, Address, Region; stacks on mobile | Same |
| Meeting detail with join links, directions, other meetings at the location | Same |

### Add to calendar

Each meeting page has **Google Calendar** and **Download .ics** buttons. Both create a weekly
repeating event in the meeting's time zone (the feed's `timezone` field, or `SETTINGS.timezone`),
so the local time stays put across daylight saving changes. The .ics file includes a generated
`VTIMEZONE` block so Outlook desktop handles it too. Logic lives in `src/app/models/calendar.ts`.
Meetings by appointment or temporarily closed don't get calendar buttons.

Not included yet: the map view, distance/geolocation sorting, and translations.

## Angular 22 notes

- **Zoneless.** No zone.js; change detection is driven by signals (the Angular 21+ default).
- **OnPush by default.** All state is in signals, so components need no explicit strategy.
- **`@angular/build`** application builder, no polyfills.
- **Fetch-based HttpClient** is the default, so `withFetch()` is gone.
- File names follow the current style guide (`meeting-list.ts`, class `MeetingList`).
- Host listeners use the `host` metadata instead of `@HostListener`.

## Layout

```
src/app/
  app.ts, app.config.ts, app.routes.ts
  settings.ts                     feed URL, feed format and defaults
  models/meeting.ts               raw feed + normalized types
  models/bmlt.ts                  BMLT → Meeting Guide adapter, NA format labels
  models/meeting-types.ts         type codes, days, time windows
  models/normalize.ts             feed → Meeting (multi-day expansion, attendance)
  models/filters.ts               URL ⇄ filters, filtering + sorting
  models/calendar.ts              Google Calendar link + .ics builder
  services/meetings-store.ts      loads feed (with fallback), exposes signals
  components/filter-bar/          search + dropdowns + type multi-select
  components/meeting-list/        heading, results table
  components/meeting-detail/      single meeting page
  pipes/                          time, day name, type label
deploy/
  deploy.sh                       build + rsync to the web root
  nginx-na.conf                   /na/ location, SPA fallback, cached feed proxy
```
