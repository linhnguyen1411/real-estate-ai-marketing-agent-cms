# Resource Budget

**Do not set thresholds so low they cause restart loops.**

## Local worker

| Budget | Suggested |
|--------|-----------|
| Worker Chrome scan tabs | **1** |
| FB CDP scan concurrency | **1** |
| Node RSS warn | **1.5 GB** |
| Chrome aggregate warn | **4 GB** (user tabs excluded from control) |
| Profile size warn | **500 MB** (legacy profile already ~104 MB) |
| Outbox pending warn | **200** |
| Log file rotate | **100 MB** / 7–14d |

## VPS

| Budget | Suggested |
|--------|-----------|
| PM2 restart memory | **≥ 1 GB** |
| Ingest batch | Settings / ≤ 10–50 |
| Telegram | bounded retry + delivery log dedupe |
| Tech retention cadence | weekly dry-run; monthly apply |

Diagnose: `npm run agent:diagnose-runtime`.
