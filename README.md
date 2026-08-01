# car-search

Watches Egyptian car-listing sites for a saved search and sends you a **Telegram** alert the
moment a new matching car is posted. Runs for free on **GitHub Actions** (a cron job) — no server.

Currently tracks **SEAT Leon · 900k–1.51M EGP · ≤90k km** across:

| Site | How it's fetched | Notes |
|------|------------------|-------|
| [Dubizzle](https://www.dubizzle.com.eg) | Direct HTTPS request | Stable ad IDs → reliable dedup |
| [Sylndr](https://sylndr.com) | Direct HTTPS request | Supported, not currently in the search config |

## How it works

```
GitHub Actions cron (hourly)
        │
        ▼
  fetch each site  ──►  parse listings  ──►  diff against state/seen.json
  (direct request)      (per-site parser)    (only genuinely NEW ones)
        │                                            │
        │                                            ▼
        │                                    send a Telegram message
        ▼                                            │
  commit updated state/seen.json  ◄──────────────────┘
```

- **No third-party fetching service.** Both sites server-render their listings into the initial
  HTML, so a plain request returns everything a headless-browser proxy would. There is no API key
  to expire, no token quota to exhaust, and nothing to pay for. This project previously proxied
  through [Jina reader](https://jina.ai/reader); that dependency is gone.
- **No duplicate alerts.** `state/seen.json` remembers every listing key we've already seen (the
  site's own stable listing ID). The GitHub Action commits it back after each run, so memory
  survives across runs. A listing is only marked seen once its alert has actually been delivered —
  a transient Telegram failure is retried next run, never silently dropped.
- **No first-run spam.** The first time a (search, site) is checked, existing listings are recorded
  silently — you only get pinged for cars posted *after* that.
- **No spam on breakage.** A failed fetch or a bot-challenge page is detected and skipped (state is
  left untouched, retried next run) rather than being mistaken for "zero listings". And if an entire
  page ever suddenly looks new (state loss, a parser recovering after a site redesign), it is
  re-recorded silently instead of blasting you with a page of stale cars.

## 1. Local quick start

```bash
nvm use            # Node 20+
npm install
npm run dry-run    # fetches live sites and prints what WOULD be sent — sends nothing
npm test           # unit + parser tests (offline, uses captured fixtures)
```

## 2. Create your Telegram bot (2 minutes)

1. In Telegram, message **@BotFather** → send `/newbot` → follow the prompts → copy the **bot token**.
2. Send your new bot any message (e.g. "hi") so it can message you back.
3. Open `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates` in a browser and copy the
   `"chat":{"id": ... }` number — that's your **chat ID**.

Test it locally:

```bash
cp .env.example .env     # then fill in the two values
# edit .env: TELEGRAM_BOT_TOKEN=...  TELEGRAM_CHAT_ID=...
npm start                # first run seeds silently; you'll get alerts on later runs
```

## 3. Deploy on GitHub Actions (the cron job)

1. Push this repo to GitHub.
2. **Settings → Secrets and variables → Actions → New repository secret**, add:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`

   Those two are the only secrets the workflow needs.
3. **Settings → Actions → General → Workflow permissions** → enable **Read and write permissions**
   (so the job can commit `state/seen.json` back).
4. The workflow [`.github/workflows/car-search.yml`](.github/workflows/car-search.yml) runs
   hourly automatically. You can also trigger it manually from the **Actions** tab
   (**Run workflow**).

The first scheduled run seeds the state (no alerts). After that, you get a Telegram message for each
newly-posted car.

## 4. Add or change a search

Edit [`config/searches.json`](config/searches.json). Each entry is one saved search across one or
more sites:

```jsonc
{
  "id": "seat-leon",                              // unique, stable — used as the state key
  "label": "SEAT Leon · 900k–1.51M EGP · ≤90k km",// shown in the Telegram message
  "filters": {
    "priceMin": 900000,
    "priceMax": 1510000,
    "titleMustInclude": ["leon"]                  // each keyword must appear in title or URL
  },
  "sources": [
    { "site": "dubizzle", "url": "https://www.dubizzle.com.eg/en/vehicles/cars-for-sale/used/seat/model-leon/?filter=mileage_max_90000" }
  ]
}
```

- Build each `url` by applying the filters **on the site itself** (price, mileage, model), then
  copying the resulting URL. The site does the heavy filtering; `filters` is a client-side safety net.
- To track a different car, add a new object with a new `id` and a source URL per site.
- `site` must be one of: `dubizzle`, `sylndr`.

## Limitations & maintenance

- **Price filtering depends on the site's structured data.** Dubizzle embeds schema.org JSON-LD
  (price, brand, model, year, thumbnail) for each ad, so `priceMin`/`priceMax` are enforced — its
  search URL filters mileage but *not* price, so this client-side band is what keeps an
  out-of-budget car from alerting you. Any ad the structured data misses keeps a `null` price and
  is surfaced anyway, on the principle that a listing you didn't want beats a listing you missed.
- **Sylndr price isn't filtered.** Its page mixes financing/down-payment figures with
  asking prices, so a parsed number would be unreliable — and a wrong price could hide a real car.
  Sylndr listings are surfaced regardless of price (you click through to check). Its search URL
  doesn't price-filter either, so this is consistent.
- **Titles are normalised to Latin script**, built from the structured brand/model/year rather than
  the seller's headline. Roughly a third of Egyptian ads are titled in Arabic ("سيات ليون 2024"),
  and `titleMustInclude: ["leon"]` would silently drop every one of them.
- **Scraping is inherently brittle.** If a site changes its markup, that site's parser may need a
  tweak — the parsers are small and isolated in `src/parsers/`, each backed by a fixture test in
  `test/`. The page-shape check and the "whole page looks new → resync silently" guard mean a
  breakage fails safe (missed alerts for a while) rather than spamming you. Run `npm run dry-run` to
  see what each site currently returns. (Dry-run previews only — it never writes `state/seen.json`.)
- **A site can start blocking us.** Fetches go straight to the site, so a Cloudflare challenge or
  an outage shows up as a warning and that site is skipped for the run (no crash, state untouched);
  the next run retries. ContactCars was dropped for exactly this reason — it sits behind a
  Cloudflare block *and* its `robots.txt` disallows `/en/cars`, so there is no legitimate way to
  read it automatically. Use its own on-site saved-search alerts if you want that coverage.
- **GitHub cron caveats.** Scheduled runs can be delayed under load, and GitHub auto-disables
  schedules after ~60 days of no repo activity (the state commits keep it active). The schedule is
  set to hourly (`0 * * * *`); nothing is metered, so tighten it in
  [`.github/workflows/car-search.yml`](.github/workflows/car-search.yml) if you want fresher checks.

## Project layout

```
config/searches.json     the searches you want to track
src/
  run.ts                 orchestrator: fetch → reconcile → notify → save state
  reconcile.ts           pure seed/diff/resync + persist-on-delivery logic (unit-tested)
  sources.ts             maps each site to its parser; validates the page looks real
  fetchers.ts            direct page fetch with retry/backoff
  parsers/               one small parser per site (+ shared helpers)
  filters.ts             client-side price / keyword narrowing
  state.ts               load/save/merge seen.json (dedup memory; never evicts live keys)
  notifier.ts            Telegram message formatting
  telegram.ts            Telegram Bot API call
state/seen.json          dedup memory, committed by the Action
test/                    unit + parser tests (fixtures captured from live sites)
.github/workflows/       the scheduled cron job
```
