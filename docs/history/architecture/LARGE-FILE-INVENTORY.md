# LARGE FILE INVENTORY

**Scope:** frontend CMS decomposition (backend listed for awareness only — not in refactor targets unless compile blocker).

Thresholds: page/component >400 LOC warning · >1000 critical.

---

## Critical frontend (>1000 LOC)

| Path | LOC | Exports | Responsibilities | Risk | Proposed action |
|------|----:|---------|------------------|------|-----------------|
| `src/App.tsx` | 5136 | default App | Auth, shell, all tabs, modals, data loading, settings, CRM, chat | catastrophic blast radius | Extract shell → feature modules (this phase) |
| `src/components/agent/AgentFindings.tsx` | 1667 | default | Lead Intelligence UI + mutations | high | Later → `features/agent/lead-intelligence/` |
| `src/ListingsPage.tsx` | 1565 | default | Public listings | high / out of admin | Defer (public site) |

---

## Warning frontend (400–999)

| Path | LOC | Proposed action |
|------|----:|-----------------|
| `src/components/admin/seoCms/PostEditorPanel.tsx` | 731 | Keep under SEO feature; split editor panels if needed |
| `src/components/agent/AgentScannedContents.tsx` | 607 | `features/agent/scanned-content/` |
| `src/components/admin/AdminPropertyDirectory.tsx` | 589 | `features/properties/` |
| `src/services/agentPlatformApi.ts` | 588 | Keep as agent HTTP client; avoid growing |
| `src/components/admin/InvestorLeadsPanel.tsx` | 545 | `features/investor-leads/` |
| `src/services/api.ts` | 472 | CMS HTTP + bootstrap; split list helpers later |
| `src/leadGen/investmentReport2026.ts` | 439 | Public lead-gen content — defer |
| `src/leadGen/buildInvestmentPlaybook.ts` | 433 | Same |

---

## App.tsx section → target map (summary)

| Section | Approx lines | Target |
|---------|-------------:|--------|
| Constants / path maps / lazy | 1–260 | `src/app/navigation/*`, `src/app/lazyPanels.ts` |
| Auth + login UI | 280–284, 701–736, 1738–1802 | `src/features/auth/` |
| Bootstrap + module loader | 472–668 | `src/features/admin-shell/dataBootstrap.ts` (later) |
| Header / sidebar / toast | 1807–2114 | `src/app/layouts/*` |
| Dashboard tab | ~2198–2579 | `src/features/dashboard/` |
| CRM / properties / AI / inbox / chat / users / settings JSX | 2584–4665 | respective `src/features/*` |
| Modals | 4680–5459 | feature modals |
| Agent path branch | uses `AgentPlatformPage` | already `src/pages/` → move under `features/agent` later |

Full line-level map: see agent audit notes in session / mirror in FRONTEND-ARCHITECTURE-REPORT after batches.

---

## Dependency graph (target)

```
main.tsx
  └─ AppProviders (router/helmet already here today)
       └─ AdminApp shell (src/App.tsx → src/app/AdminApp.tsx)
            ├─ AuthGuard / LoginPage
            ├─ AdminLayout (Header + Sidebar + Outlet/content)
            └─ Feature pages (lazy) via tab or real routes

features/*  ──imports──▶  shared/*
app/*       ──imports──▶  features/* | shared/*
features/*  ✗─imports──▶  app/*   (forbidden)
shared/*    ✗─imports──▶  features/* (forbidden)
```

---

## Backend large files (explicit non-goals)

`findingRuleEngine`, `agentRoutes`, `agentDb`, `ingestService`, `dbHelper`, `aiService`, Facebook adapters — **no changes** in this phase.
