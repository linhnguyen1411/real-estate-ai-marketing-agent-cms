# AI Operations Experience

Experience layer for Telegram Operations Center (Phase F5).

## Boundary

**In scope:** Control Plane · Copilot · Telegram presentation · inline keyboards.

**Out of scope:** Scanner · Publisher · Mission Runtime · Browser Runtime · Execution Agent · Runtime API · Metrics Collector · business rules.

## Experience stack

```
Operator (Telegram)
  → ACL
  → Copilot (NL + intents)
  → Ops Summaries / Intelligence / Recommendations
  → Control Plane Port
  → Command Engine / Ops Metrics / Fleet / Reports
```

## Design references

Short replies like GitHub Copilot / Linear / Notion AI:

1. One-line verdict
2. A few human facts
3. Incidents (if any)
4. One recommendation
5. Buttons

## Intelligence signals

Idle / Busy machine · Hot browser · Memory high · Queue backlog · Retry loop · Publish failure · Checkpoint · Offline agent · Source removed · Scanner/Publisher idle · Duplicate publish · Slow mission · Health low.

## Success

Operator can monitor, diagnose, retry, pause/resume, release browser, inspect fleet/scanner/publisher/mission/leads **without opening the web dashboard** and without memorizing slash commands.
