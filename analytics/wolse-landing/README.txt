Seoul Rent Escape EN landing measurement

Source: this directory and wolse-escape/en/metrics.js. No Korean page changes.
Worker: wolse-landing-metrics, new isolated SQLite Durable Object LandingMetrics.
Origin: https://play-fold.net. Only POST /collect and GET /health are public.
GET /report requires a 256-bit bearer secret, kept outside the repository.

Read totals:
node analytics/wolse-landing/report.mjs
node analytics/wolse-landing/report.mjs from=2026-11-27 to=2026-11-27
node analytics/wolse-landing/report.mjs qa=1
The private config path is ~/Library/Application Support/PLAYFOLD/ServiceConnections/wolse-landing-metrics.json (mode 600). Never copy its contents into the site, repository, logs, or chat.

Metric definitions:
- visits: observed page loads, counted once per random in-memory page reference per UTC day. A click can recover a missing visit beacon.
- clicked_visits: observed page loads with at least one App Store button click.
- click_through_rate = clicked_visits / visits. Not purchases, installs, or confirmed App Store arrivals.
- hero_us/hero_gb/bottom_us/bottom_gb: each button counted at most once per page load per UTC day. Sum can exceed clicked_visits.
- no persistent visitor ID; reload is a new visit. No IP, UA, URL, raw query, email, or full referrer stored in measurement records. Platform network/security processing is separate.
- individual random page references are removed after about two days via daily alarm, daily aggregates after about one year.
- reports use UTC days and exclude QA by default. QA = metrics_test=1 or local hostname; always use metrics_test=1 for public QA.
- Instagram ad source recognized only when all four exact values match:
  utm_source=instagram, utm_medium=paid_social,
  utm_campaign=wolse_us_uk_20261124, utm_content=rank_v3_20261127.
- unrecognized query values become other; no query strings leave the page. Known organic referrer hosts become instagram_organic/facebook_organic; otherwise direct/other.

Limits: 512-byte payload, strict fields and types, fixed event/source/CTA allowlists, HTTPS origin allowlist, 300 valid requests/minute global in-object rate guard, per-page/button deduplication. Public anonymous analytics are estimates, can be blocked or spoofed, and do not identify people. Origin checks are not authentication.
No runtime request/body logging. No cron, no unrelated Worker edits. Durable Object alarm performs deletion.

Official references checked 27 November 2026:
https://developers.cloudflare.com/workers/platform/pricing/
https://developers.cloudflare.com/durable-objects/platform/pricing/
https://developers.cloudflare.com/durable-objects/get-started/
Workers Free and SQLite Durable Objects Free stop at free tier limits instead of billing overage. Deployment requires confirmation of this account's Free plan; do not upgrade to a paid plan.
