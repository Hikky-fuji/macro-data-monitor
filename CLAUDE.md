# Macro Data Monitor Agent Context

```yaml
document:
  purpose: "Repository contract for AI coding agents"
  reviewed: "2026-10-30"
  authority_order:
    - "Current human instruction"
    - "Current repository state and tests"
    - "This file"
    - "Historical notes"
  warning: "Re-check live code, upstream releases, and production before claiming current status."

project:
  name: "Macro Data Monitor"
  former_name: "JapanPulse (renamed 2026-10-30; site, URL and repository renamed, former addresses redirect; internal identifiers unchanged)"
  production: "https://macro-data-monitor.vercel.app"  # former japanpulse.vercel.app redirects
  repository: "https://github.com/Hikky-fuji/macro-data-monitor"
  type: "Personal macroeconomic decision-support workspace"
  audience:
    primary: "Owner: bank-ALM / investment practitioner, CFA Level III candidate, CMA (SAAJ)"
    secondary: "Users who need transparent Japan/US macro monitoring"
  objective: >-
    Convert fragmented official macro data into a fast, transparent, mobile-accessible
    workflow for interpreting inflation, labor, growth, surveys, rates, and policy.
  non_objectives:
    - "Do not generate trading signals or portfolio instructions."
    - "Do not claim to forecast asset returns."
    - "Do not replace Bloomberg's full data/search/execution coverage."
    - "Do not present scenarios, proxies, or nowcasts as official observations."
    - "Do not claim causal relationships from descriptive co-movement."
```

## 1. Product principles

```yaml
principles:
  source_quality:
    - "Prefer primary official publishers and official APIs/files."
    - "FRED is an official delivery layer, not always the original publisher. Link the original release where material."
    - "Record source, frequency, units, seasonal adjustment, latest observation, and retrieval/update state."
  interpretation:
    - "Optimize for decision usefulness, not maximum indicator count."
    - "Show established analytical transformations; leave rates/FX/positioning judgment to the user."
    - "Separate level, monthly impulse, short-run momentum, and year-over-year trend."
    - "Explain assumptions and limitations near the output they affect."
  epistemic_labels:
    official: "Publisher observation or directly delivered official series"
    derived: "Deterministic calculation from official observations"
    proxy: "Approximation to a concept; never label as the official concept"
    scenario: "Mechanical conditional path; never call a forecast"
    nowcast: "Estimate of a not-yet-released contemporaneous indicator; show model/error/uncertainty"
    reference: "Preserved labeled snapshot when reliable automatic advancement is unavailable"
  missing_data:
    - "Do not silently interpolate missing official observations."
    - "Preserve known publication gaps and explain them."
    - "Do not turn an empty or malformed core series into a successful feed."
  revisions:
    - "Assume macro data can be revised."
    - "Do not imply backtests use real-time vintages unless vintage data were actually used."
```

### Domain-specific invariants

- US CPI `3M ann.` is a three-month annualized index change, not a three-month moving average:
  `((index_t / index_t-3) ** 4 - 1) * 100`.
- Japan detailed CPI uses official year-over-year rates and NSA monthly detail. Its `3MMA` is the average of the latest three official YoY rates. Do not manufacture a seasonally adjusted annualized rate from detailed NSA series.
- `Services ex Shelter` on the US CPI page is a **CPI proxy** and includes energy services. It is not the Federal Reserve's official core-PCE-services-ex-housing measure.
- CPI contribution blocks must be non-overlapping before summing. Detailed diagnostic subcategories may overlap and must be labeled accordingly.
- A Taylor-rule `actual - rule` gap is a diagnostic comparison and does not prove that policy is restrictive or accommodative.
- Taylor 1993, Balanced Approach, Clarida-CGG proxy, and Bullard Modernized have different assumptions. Preserve their equations, inputs, source links, and caveats.
- Household-credit transition flows are flows. Do not re-annualize or confuse them with delinquency stocks.
- Weekly claims interpretation should prioritize the official four-week average over one noisy weekly print.

## 2. Technology and repository layout

```yaml
runtime:
  framework: "Next.js 14.2.29 App Router"
  language: "JavaScript / React 18"
  charts: ["Chart.js", "react-chartjs-2", "D3"]
  files: ["xlsx"]
  hosting: "Vercel"
  analytics: "@vercel/analytics"

layout:
  app_pages: "app/**/page.js"
  api_routes: "app/api/**/route.js"
  shared_ui: "app/components"
  domain_logic: "app/lib"
  tests: "tests/*.test.mjs"
  production_smoke: "scripts/smoke-site.mjs"
  global_metadata: "app/layout.js"
  source_registry: "app/lib/official-sources.mjs"
  interpretation_registry: "app/lib/indicator-guides.mjs"
  importance_registry: "app/lib/significance.js"
  navigation_search: "app/components/SiteChrome.js"
```

When adding or removing a public dashboard, update all applicable registries, navigation/search, status/health definitions, smoke checks, metadata, and integrity tests. Do not add an orphan page or an API that is never monitored.

## 3. Environment variables

```yaml
env:
  ESTAT_APP_ID:
    required_for: "Most e-Stat REST API routes"
    secret: true
  FRED_API_KEY:
    required_for: "Complete US release calendar"
    optional_for_series: true
    fallback: "Most FRED series routes use official fredgraph.csv when the API key/API is unavailable"
  ESTAT_IIP_LATEST_ID:
    required_for: "/api/iip current workbook"
    secret: false
    maintenance: "Advance only after verifying workbook schema and period"
  ESTAT_IIP_PREV_ID:
    required_for: "/api/iip previous workbook"
    secret: false
  CRON_SECRET:
    required_for: "/api/cron/refresh-data"
    secret: true
  VERCEL_PROJECT_PRODUCTION_URL:
    provided_by: "Vercel"
    use: "Cron origin and production-origin fallback for protected preview health checks"
  VERCEL_ENV:
    provided_by: "Vercel"
    use: "Preview/production routing behavior"
```

Never print, commit, or copy secret values into logs, issues, prompts, fixtures, or documentation. `.env*` files are ignored. Check only whether a key exists unless the human explicitly asks for a value-level operation.

## 4. External data-source policy

```yaml
Japan:
  e_Stat: ["CPI", "Tokyo CPI", "GDP", "labor", "job ratio", "trade", "activity datasets"]
  BOJ: ["CGPI/SPPI", "Tankan", "underlying inflation", "output gap", "yen/effective FX series"]
  Cabinet_Office: ["GDP", "machine orders", "Economy Watchers"]
  METI: ["industrial production", "tertiary activity"]
  MHLW: ["wages", "employment statistics"]
  MLIT: ["housing", "tourism/accommodation"]
  JNTO: ["visitor arrivals"]
  Customs: ["trade headline CSV"]

United_States:
  FRED: "Primary delivery layer for many series; use API then official CSV fallback where implemented"
  BLS: ["CPI", "PPI", "Employment Situation", "JOLTS"]
  BEA: ["GDP", "PCE", "income/spending"]
  Federal_Reserve: ["Fed funds", "policy material", "rates", "financial conditions"]
  Census_HUD_FHFA: ["retail", "housing", "house prices"]
  DOL_ETA: ["initial and continuing claims"]
  NY_Fed: ["Empire survey", "household credit"]
  Philadelphia_Fed: ["manufacturing survey"]
  ISM: "Manual official snapshot only; see special rule below"
```

### ISM hard rule

ISM does not expose a suitable public API, and its website terms restrict automated collection. Do **not** add scraping, browser bots, hidden endpoints, or copied third-party values as an automatic official feed.

Current implementation: `app/api/us-manufacturing/route.js` contains `ISM_SNAPSHOT` with:

- explicit official source URL;
- `updateMode: Official snapshot — manually verified`;
- `verifiedAt` date;
- 12-month headline history;
- latest headline and components.

For a manual update:

1. Verify the new release on the official ISM page.
2. Append the new month; retain the latest 12 months.
3. Update every latest component and `verifiedAt`.
4. Confirm `latest.headline` equals the final history observation.
5. Run tests/build and visually verify `/us/manufacturing`.

An ISM nowcast may be added only as a separately labeled estimate with method, training/evaluation window, error metrics, uncertainty, and automatic replacement by the official value after release.

## 5. API inventory and minimum response contracts

All endpoints are GET Route Handlers. A JSON body containing `{ "error": ... }` is a failed feed even if HTTP status is 200. Preserve existing top-level keys because pages, aggregation, health checks, and smoke tests depend on them.

### Operations

| Endpoint | Minimum contract | Notes |
|---|---|---|
| `/api/data-health?country=JP|US` | `items`, `summary` | Freshness states: `current`, `reference`, `stale`, `failed`; retries transient failures |
| `/api/workspace-pulse?country=JP|US` | `sources`, `summary` | Aggregates core workspace endpoints; exposes per-source status |
| `/api/release-calendar` | `events`, `fetchedAt`, `warnings` | Official schedules only; FRED key needed for complete US events |
| `/api/cron/refresh-data` | `ok`, `results` | `Authorization: Bearer $CRON_SECRET`; daily Vercel backstop |

### Japan

| Endpoint | Minimum top-level keys |
|---|---|
| `/api/cpi` | `headline`, `contrib`, `metadata` |
| `/api/tokyo-cpi` | `headline` |
| `/api/ppi` | `cgpi`, `sppi` |
| `/api/boj-policy` | `latest`, `meta` |
| `/api/yen-transmission` | `latest` |
| `/api/gdp` | `gdp_qoq` |
| `/api/iip` | `鉱工業`, optional `forecast` |
| `/api/tsip` | `latest` |
| `/api/machine-orders` | `latest` |
| `/api/consumption` | `total` |
| `/api/housing` | `series`, `fetchedAt` |
| `/api/tankan` | `large_mfg` |
| `/api/watcher` | `current_all` |
| `/api/wages` | `nominal` |
| `/api/labour` | `data` |
| `/api/job-ratio` | `latest` |
| `/api/trade` | `export`, `import` |
| `/api/inbound-tourism` | `arrivalSummary`, `meta` |
| `/api/nikkei` | best-effort Yahoo Finance payload; not a core official health feed |

### United States

| Endpoint | Minimum top-level keys |
|---|---|
| `/api/us-cpi` | `series`, `fetchedAt` |
| `/api/us-ppi` | `series`, `fetchedAt` |
| `/api/us-consumption` | `series`, `fetchedAt`, `meta` |
| `/api/us-household-credit` | `series`, `latestQuarter`, `meta` |
| `/api/us-retail-sales` | `series`, `fetchedAt`, `meta` |
| `/api/us-housing` | `series`, `fetchedAt`, `meta` |
| `/api/us-employment` | `employment`, `sectors`, `sectorAhe`, `sep`, `meta` |
| `/api/us-initial-claims` | `series`, `fetchedAt` |
| `/api/us-jolts` | `series`, `fetchedAt` |
| `/api/us-manufacturing` | `regional`, `ism`, `cadence` |
| `/api/us-macro` | `growth`, `policy`, `employment`, `meta` |
| `/api/us-rates` | `series`, `latest` |

### Delivery resilience

- `app/lib/resilient-fetch.js` retries only network errors, timeouts, HTTP 429, and HTTP 5xx. Permanent 4xx responses are not retried.
- Default strategy is two attempts with a short backoff. Do not add unbounded retries or hide sustained upstream failures.
- `app/lib/fred.js` attempts the keyed FRED API first, then official `fredgraph.csv`, preserves order, filters missing `.` observations, and can aggregate daily values to monthly averages.
- Endpoint-level partial-data behavior must be explicit in `meta.partial` / `meta.warnings` when supported. Core-series absence should remain visible to health checks.

## 6. Primary dashboards

Core set decided by the owner on 2026-10-30. The single source of truth is
`app/lib/core-indicators.mjs`; all other dashboards are Archive (routed and
monitored, collapsed on the workspaces, warn-only in the production smoke test).

```yaml
Japan_core:            # prices, wages, BOJ policy monitor
  - "/cpi"
  - "/tokyo-cpi"
  - "/wages"
  - "/boj-policy"      # also depends on /api/ppi and /api/tankan

US_core:               # overnight releases in Japan time
  - "/us/cpi"
  - "/us/employment"
  - "/us/consumption"  # PCE
  - "/us/manufacturing"
  - "/us/rates"
  - "/us-macro"        # Fed policy incl. Taylor-rule monitor

operations:
  - "/status"

hardening_target: "Every core API must stay current; core failed/stale fails CI."

product_direction:
  trade: >-
    Trade is not central to the owner's daily decision workflow; Bloomberg is sufficient for
    occasional detailed lookup. Treat Trade as secondary/reference unless the human explicitly
    requests expansion. Do not delete the route or feed without an explicit change request.
```

Every analytical chart should remain readable on desktop and mobile, include units/frequency/source context, and retain `Copy image` / `Download PNG` controls where the surrounding dashboard uses them.

## 7. Policy-rule monitor

Route: `/us-macro#fed-policy`.

Purpose: compare the effective federal funds rate with transparent diagnostic benchmarks, not predict FOMC decisions.

```yaml
rules:
  Taylor_1993:
    formula: "2 + pi + 0.5*(pi-2) + 0.5*output_gap"
    caveat: "Fixed 2% real neutral rate"
  Balanced_Approach:
    formula: "2 + pi + 0.5*(pi-2) + 1.0*output_gap"
  Clarida_CGG_proxy:
    formula: "0.79*i[t-1] + 0.21*(4.12 + 2.15*(Epi-2) + 0.93*output_gap)"
    caveat: "Implementable proxy, not a claim that Clarida published this exact real-time series"
  Bullard_Modernized:
    formula: "0.85*i[t-1] + 0.15*(r_star + 2 + 1.5*(Epi-2) + 0.1*output_gap)"
    caveat: "r-star and expected-inflation inputs are proxies"
```

Preserve aligned common-quarter inputs and disclose revisions, gap-estimate uncertainty, neutral-rate assumptions, the 5Y-breakeven-to-PCE adjustment, and HP-filter choices.

## 8. Freshness and status semantics

`app/api/data-health/route.js` is the source of truth for monitored definitions and expected publication windows.

```yaml
states:
  current: "Valid latest period within route-specific maxAge"
  stale: "Valid period exists but is older than maxAge"
  failed: "Request, JSON, core payload, or observation-date extraction failed"
  reference: "Intentionally preserved and explicitly labeled snapshot"
modes:
  AUTO: "Automatic official feed"
  HYBRID: "Live headline plus labeled snapshot/fallback detail"
  MIXED: "Combination such as automatic regional surveys plus manual ISM"
  SNAPSHOT: "Reference data; no claim of automatic freshness"
```

Do not solve a red status by loosening `maxAge` without evidence from the publisher's actual cadence. Diagnose: credentials -> upstream HTTP -> schema -> period extraction -> freshness threshold -> page rendering.

## 9. Scheduled refresh and caching

- Vercel cron: `45 13 * * *` (13:45 UTC daily; schedule is UTC).
- Cron warms JP/US workspace pulse, JP/US health, release calendar, US PPI, US household credit.
- Route-level `revalidate` varies by cadence. Preserve intentional caching unless freshness evidence requires change.
- Health cache: `s-maxage=900`, stale-while-revalidate.
- Aggregated workspace cache: `s-maxage=900`, longer stale-while-revalidate.
- Protected Vercel preview deployments cannot reliably self-fetch their authenticated preview origin. Health/aggregation use `VERCEL_PROJECT_PRODUCTION_URL` in preview.

## 10. Development, validation, and release

```bash
npm install
npm run dev
npm test
npm run build
npm run check
npm run smoke:production
```

Required validation for material feed or analytical changes:

1. `git diff --check`.
2. `npm test`.
3. `npm run build`.
4. Exercise the changed API with realistic data and inspect top-level contract, dates, values, units, missing values, warnings, and source metadata.
5. Visually inspect the changed page at desktop and mobile widths; check console/network errors and chart labels.
6. For production changes, wait for Vercel `READY`, then run the relevant public API/page checks and preferably `npm run smoke:production`.
7. Report exactly what was verified. Do not infer production success from a local build or HTTP 200 alone.

Tests currently cover:

- release/calendar date arithmetic;
- FRED CSV parsing and monthly aggregation;
- transient retry behavior;
- Japan CPI momentum rules;
- US CPI scenario arithmetic and missing-comparison handling;
- NY Fed household-credit parsing/definitions;
- route/page/source/guide integrity;
- current manual ISM snapshot consistency;
- BOJ core-CPI base-year detection and linking;
- e-Stat status handling and required/optional series;
- core registry coverage (pages, APIs, health, gated smoke) and the single canonical origin / legacy-host redirect.

When adding domain calculations, add pure helpers plus deterministic unit tests. When changing a response contract, update pages, health extraction, workspace aggregation, smoke checks, and tests in the same change.

## 11. Safe repository operations

- Preserve unrelated and uncommitted human changes.
- Use targeted patches; do not run destructive Git commands.
- Do not edit `.env*` unless explicitly asked.
- Do not silently add dependencies, external services, scraping, tracking, or paid APIs.
- Do not push, deploy, publish, or open a PR unless the human request authorizes it.
- Do not use stale local data to claim a feed is currently healthy; verify live state when current status matters.
- Production domain is canonical: `https://macro-data-monitor.vercel.app` (single source: `app/lib/site.mjs`). The former `japanpulse.vercel.app` redirects.

## 12. MBA project context

The pre-existing JapanPulse platform is the foundation, not itself the new course deliverable. Course-project work should be framed as:

```yaml
course_project:
  enabling_infrastructure:
    - "Repair and harden US feeds"
    - "Make failures, staleness, fallbacks, and manual snapshots visible"
  analytical_work:
    - "Investigate compliant ISM handling and a separately labeled nowcast if rigorously validated"
    - "Build a cross-indicator view connecting manufacturing, employment, inflation, and policy"
  evaluation:
    - "Before/after feed reliability"
    - "Freshness and source transparency"
    - "Historical-period validation"
    - "Explicit assumptions, revisions, errors, and limitations"
  boundary: "Neutral decision support; no automatic trading recommendation or black-box return forecast"
```

For professor-facing explanations, skip textbook economics. Explain implementation choices, transformations, proxies, data vintage/revisions, validation, failure modes, and what the tool deliberately does not claim.
