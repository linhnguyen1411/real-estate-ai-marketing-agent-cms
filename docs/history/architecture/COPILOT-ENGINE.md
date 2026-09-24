# Copilot Engine

**Module:** `server/modules/control-plane/copilot/`  
**Channel-agnostic** — Telegram is one adapter among many.

---

## Principles

- DRY / SOLID
- **Registry** of intent handlers (Strategy) — no giant free-text switch in the engine
- **Adapter** ports for Control Plane I/O (`CopilotControlPlanePort`)
- Single **prompt catalog** (`prompts.ts`)
- Single **reply formatter** (`replyFormatter.ts`)
- Never call Browser / Mission cores / Prisma from Telegram layer
- Never bypass Control Plane

---

## Pipeline

```
Message
  → classify (rules first, optional LLM)
  → IntentRegistry.resolve(handler)
  → handler.execute(port, ctx)
  → CopilotReply { text, lines, replyMarkup }
```

---

## Layout

| File | Role |
|------|------|
| `types.ts` | Intents, slots, session, reply |
| `contextStore.ts` | Per-chat memory (swap Redis later) |
| `ruleClassifier.ts` | Deterministic NL patterns |
| `classifier.ts` | Rule + optional LLM |
| `intentRegistry.ts` | Strategy registry |
| `handlers.ts` | Intent strategies |
| `ports.ts` / `controlPlanePort.ts` | Control Plane adapter |
| `insightEngine.ts` | Rule (+ optional LLM) insights |
| `summaryScheduler.ts` | 08/12/18 wall-clock |
| `prompts.ts` | Shared prompts |
| `index.ts` | `createCopilotEngine` |

---

## Extensibility

Future channels implement only:

1. Inbound text / callback → `CopilotMessageInput`
2. Outbound `CopilotReply` → native message + keyboard

Same engine instance / factory for Discord, Slack, Zalo, Web Chat, Voice.

---

## LLM

Default: **rules only** (offline-safe, testable).  
Enable enrichment with `TELEGRAM_COPILOT_LLM=1` via existing `generateText` (`server/aiService.ts`).
