# R1 Baseline

**Captured:** 2026-07-14 ~11:20 ICT  
**Branch:** `feature/refactor`  
**Commit:** `789c5a1` — `chore(refactor): close R0 stabilization gate`  
**Status:** Descendant of R0 gate with **no R1 domain code yet** (only untracked R0 raw logs).

## Preconditions

| Check | Result |
|-------|--------|
| `git status` | clean code tree; untracked `_r0-*-raw.txt` only |
| `git diff --stat` | empty |
| `git diff --check` | clean |
| `npm run test:agent-regression` | **22/22 PASS** (~33s) |
| `npm run lint` | **PASS** |
| `npm run build` | **PASS** after intentional stop of CMS/worker (Prisma EPERM unlock on Windows), then restart — health **success** |

Rollback checkpoint: **`789c5a1`**.

## Live DB classification distribution (sample pool)

| classification | count |
|----------------|------:|
| buyer | 52 |
| investor | 20 |
| renter | 9 |
| null | 1 |
| seller / landlord / broker | **0** in current local DB |

Seller / broker demand / supply shapes below use **synthetic fixtures** from regression tests (same texts as classification/cashflow suites), not live rows.

Raw capture (local artifact, not for production commit of PII): `docs/refactor/_r1-baseline-raw.json`.

---

## Sample shapes

### 1. Buyer (live)

| Field | Value |
|-------|--------|
| id | `cmrk4sq0h00vdls3t2s2kediu` |
| Prisma | `classification=buyer`, `intent=buy`, `actorRole=demand_side`, `score=68`, `finalScore=68`, `status=new`, `consumptionType=none` |
| extractedData keys | actorRole, aiScore, analysis, classification, confidence, contact, diagnostics, domain, finalScore, intelligence, intent, keywordScore, leadFitScore, location, matching, money, property, requirements, source, urgency |
| API (via enrichFindingForApi) | same columns + overlays `resolved`, `analysisStatus`, `consistencyWarnings`, BigInt money → string |
| resolver | analyzed / buyer / buy / demand_side / finalScore 68 / scored / confirmed / phone null |
| FE fields used | classification, intent, actorRole, finalScore, displayScoreLabel, primaryPhone, summary, budget/location/property displays, showAsConfirmedLead, analysisStatus; detail drawer also reads `extractedData.*` for tabs |

### 2. Renter (live)

| Field | Value |
|-------|--------|
| id | `cmrk2xh1w023xa2faqh3h9xni` |
| Prisma | `classification=renter`, `intent=rent`, `actorRole=demand_side`, `finalScore=65` |
| resolver | partial / provisional / phone `0868339779` / confirmed |

### 3. Investor (live)

| Field | Value |
|-------|--------|
| id | `cmrk50hll00zbls3tn97olgqz` |
| Prisma | `classification=investor`, `intent=unknown`, `actorRole=demand_side`, `finalScore=56` |
| resolver | analyzed / scored / phone null |

### 4. Seller supply (synthetic — no live seller row)

Fixture text family: “Dãy trọ / đất / nhà … nhỉnh X tỷ / bán …” (see `scripts/test-finding-structured-data.ts`, cashflow supply).

| Expected resolver direction | classification ≈ seller / seller-like supply, actorRole supply_side, askingPrice path — not buyer budget |
| extractedData | money.askingPrice*, property.propertyTypes, not buyerBudget* as primary |

### 5. Broker demand (synthetic)

Fixture family: broker representing customer seeking property (“khách cần tìm …”).

| Expected | classification=broker, representedDemand/demand_side signals, brokerActivity |

### 6. Broker supply (synthetic)

Fixture family: “Vinhomes … quỹ độc quyền …” etc.

| Expected | classification=broker, supply_side listing fields, asking/inventory path |

### 7. Unknown / needs_review (live legacy)

| Field | Value |
|-------|--------|
| id | `cmrg2sbgd00012ocwvsckupxa` |
| Prisma | `classification=null`, `score=…`, `finalScore=45` |
| extractedData keys | **legacy**: `canonicalUrl`, `leadAnalysis`, `matchedNegative`, `matchedPositive`, `scoreBreakdown` |
| resolver | inconsistent / unknown / scoreStatus failed / showAsConfirmedLead **false** |

### 8. Finding with legacy extractedData

Same as #7 — only legacy keys, no structured `person`/`contact`/`intelligence` blocks. Resolver still maps via `leadAnalysis` + scoreBreakdown without treating legacy `score` as confirmed `finalScore` display when inconsistent.

### 9. Finding promoted (live)

| Field | Value |
|-------|--------|
| id | `cmrioh2a8009t10jj8xq6nb8i` |
| Prisma | `status=promoted_to_investor_lead`, `consumptionType=investor_lead` |
| classification | buyer (demand retained post-promote) |
| resolver | provisional / finalScore 62 |

### 10. Finding consumed → external inventory (live)

| Field | Value |
|-------|--------|
| id | `cmriofmac004310jj20w6u4wo` |
| Prisma | `status=saved_to_external_inventory`, `consumptionType=external_inventory` |
| Note | this row’s classification remains buyer in DB (historical); inventory status is the lifecycle signal |

### Extra reference: legacy score=100 / classification null

Covered by `scripts/test-lead-intelligence-resolver.ts` — expects display “Cần xem lại”, `finalScore` null from column, `showAsConfirmedLead=false` (never promote legacy score → finalScore).

---

## API response shape (list/detail today)

- Route: `GET /api/agent/findings` (no separate detail URL; same `enrichFindingForApi`).
- Envelope: `{ status, data[], meta }`.
- Enrichment adds/overlays: `classification`, `intent`, `actorRole`, `finalScore`, `scoreStatus`, `summary`, `needSummary`, `personName`, `primaryPhone`, `primaryLocation`, `analysisStatus`, `consistencyWarnings`, **`resolved`** (full resolver object).
- Compatibility: top-level legacy columns + full `extractedData` still present.
- **Gap for R1:** no dedicated `intelligence` DTO alias yet; FE still calls `resolveLeadIntelligence(finding)` client-side and detail drawer reads `extractedData` for advanced tabs.

## Frontend fields in active use

Cards: resolver outputs (classification badges, score label, phone, summary, location/budget/property displays, action availability).

Detail drawer (`AgentFindings.tsx`): `resolveLeadIntelligence(finding)` **plus** direct `extractedData` paths — `contact`, `money`, `location`, `property`, `requirements`, `intelligence`, `analysis`/`diagnostics`, `matching`, `domain`.

## Import note

Backend already imports FE util: `server/agent/agentDb.ts` → `src/utils/resolveLeadIntelligence`. R1 must produce a shared pure module both sides can import without React/Prisma.
