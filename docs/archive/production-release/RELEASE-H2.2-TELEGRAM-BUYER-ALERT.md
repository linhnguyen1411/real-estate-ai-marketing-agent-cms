# H2.2 — Telegram Buyer Alert → Sales Action Card

**Date:** 2026-07-27  
**Commit:** `feat(telegram): redesign buyer alert for sales action`

## Objective

Redesign Telegram Buyer Alert into a Sales Action Card so sales understands a lead in &lt;10 seconds: WHO / WHAT / WHERE / BUDGET / WHEN / WHY / NEXT ACTION.

## Audit (real fields used)

| Need | Source |
|------|--------|
| Name / Actor | `AgentFinding.personName`, sales `owner` |
| Property type | `propertyType`, campaign `propertyHint`, persona |
| Location | `primaryLocation` |
| Budget | `budgetMin`/`budgetMax` (VND or tỷ → normalized) |
| Area | `extractedData.area.areaMinM2/Max` |
| Timeline | acquisition `timeline` |
| Buyer confidence | acquisition `priority.finalScore` (single metric) |
| Campaign | `campaignMatch.campaignName` (hidden if null) |
| Source | `AgentSource.name/type` + `scannedContent.canonicalUrl` |
| Why | intent `reasons` / patterns |
| AI action | Sales Layer `recommendSalesAction` + actionable copy |
| Owner / journey | `salesLayer` profile |

**No fake fields.** Empty fields are omitted (not shown as `—`).

## Architecture

```
Finding → Lead Acquisition → Sales Layer → formatSalesActionCard → Telegram (dedupe buyer_alert:leadId)
                                      ↘ recordSalesAction (Call/Contact/Assign/Ignore/Open/Source)
```

Shared heat: `classifyBuyerHeat` / `shouldSendBuyerAlert` (≥40) — Sales Layer, not Telegram-only.

## Changed Files

- `server/modules/sales-layer/buyerHeat.ts` (new)
- `server/modules/sales-layer/telegramSalesActionCard.ts` (new)
- `server/modules/sales-layer/telegramSalesCard.ts`
- `server/modules/sales-layer/salesRecommendation.ts`
- `server/modules/sales-layer/salesService.ts` (`recordSalesAction`)
- `server/modules/sales-layer/pipelineValue.ts` (`normalizeTy`)
- `server/modules/sales-layer/index.ts`
- `server/modules/lead-acquisition/telegramBuyerAlert.ts`
- `server/modules/lead-acquisition/acquisitionService.ts` (heat gate)
- `server/notifications/telegramNotificationService.ts`
- `server/modules/control-plane/inlineKeyboard.ts`
- `server/modules/control-plane/operationsService.ts`
- `server/modules/control-plane/command-engine/operationsCommands.ts`
- `src/features/agent/lead-center/pages/LeadCenterPage.tsx` (`?findingId=`)
- `scripts/test-telegram-buyer-alert-v2.ts`
- smoke scripts updated

## Telegram UX

- One card: `🎯 BUYER LEAD` + heat + demand/geo/budget/area/timeline + **BUYER CONFIDENCE only** + AI + short SIGNAL
- Buttons: Call · Contact · Open Lead · Source · Assign · History · Ignore
- Deduped `buyer_alert:{findingId}`
- Open Lead → `/admin/agents/lead-center?findingId=`
- Source → real permalink when present; else metadata via `/lead source`

## Tests

`npx tsx scripts/test-telegram-buyer-alert-v2.ts` → **PASS**  
Smokes: lead-acquisition + sales-layer → **PASS**

## Verdict

**GO** — Sales Action Card ready; deploy to VPS for live Telegram on next buyer.
