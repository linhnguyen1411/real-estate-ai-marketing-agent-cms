# AI Operations Copilot

Telegram is a **thin client** for the Control Plane Copilot — not a command dump, not a JSON logger.

## Goal

Answer in natural language:

- Hệ thống đang làm gì?
- Máy nào đang làm gì?
- Có vấn đề gì không?
- Có cần mình xử lý gì không?

## Architecture

```
Telegram Update
  → ACL
  → Copilot Engine (classify + intent handlers)
  → Control Plane Port (ops metrics / fleet / reports / commands)
  → Mission / Runtime / Execution Agent (unchanged)
```

**Out of scope (do not modify for Copilot features):**

- Scanner · Publisher · Mission Runtime · Browser Runtime · Execution Agent
- Runtime API contract · Metrics Collector internals

## Conversation first

| User says | Intent | Reply |
|-----------|--------|-------|
| Có gì mới? | `whats_new` / `dashboard` | Operations brief + incidents |
| Máy nào đang bận? | `fleet_summary` | Fleet awareness cards |
| Có lỗi không? | `incident_summary` | Incident Center |
| Scanner sao rồi? | `scanner_summary` | Scanner Summary |
| Publisher thế nào? | `publisher_summary` | Publisher Summary |
| Mission thế nào? | `mission_summary` | Mission Summary |
| Tại sao Scanner không chạy? | `runtime_explain` | Plain-language explain |
| Nên làm gì? | `ops_recommendation` | Recommendations |
| Chi tiết LINH-PC | `machine_detail` | Machine Detail + buttons |
| Browser? | `browser_detail` | Browser Detail + buttons |

Slash commands still work via `raw_command` → Command Engine.

## Summaries (no raw metrics)

Formatters live in `server/modules/control-plane/copilot/opsSummaries.ts`.

- Progress bars (`██████░░`)
- Role lines (Scanner / Publisher / Control Plane)
- Human severity marks (`⚠` / `❌` / `ℹ`)

## Incident Center + Recommendations

Detection: `operationalIntelligence.ts`  
Actions: `recommendations.ts`

Examples:

| Incident | Recommendation |
|----------|----------------|
| Source Removed | Do not retry → remove source / clear job |
| Browser Locked | Release Browser |
| Publish Failed | Retry |
| Agent Offline | Restart Agent |

## Smart inline actions

Every Copilot reply attaches a keyboard (`opsActionKeyboard`, `machineActionKeyboard`, `browserActionKeyboard`, …).

Callbacks map to Control Plane slash commands via `callbackDataToCommand` — Telegram never calls Runtime directly.

## Daily briefing

Scheduler slots (Asia/Ho_Chi_Minh): **08:00 / 12:00 / 18:00**

Payload: Scanner · Publisher · Mission · Fleet · Health · Top Leads · Incidents · Recommendations.

## Tests

```bash
npm run test:telegram-copilot
```

## Files

| Path | Role |
|------|------|
| `copilot/operationalIntelligence.ts` | Signal detection |
| `copilot/recommendations.ts` | Action advice |
| `copilot/opsSummaries.ts` | Human summaries |
| `copilot/handlers.ts` | Intent strategies |
| `copilot/ruleClassifier.ts` | NL rules |
| `copilot/controlPlanePort.ts` | Control Plane reads/writes |
| `inlineKeyboard.ts` | Smart buttons |
