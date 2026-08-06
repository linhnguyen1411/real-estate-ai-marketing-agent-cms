# BATCH 2 BASELINE

**Date:** 2026-07-14  
**Branch:** `feature/performance-cms-loading`  
**HEAD:** `3853fa3` (`refactor(app): extract providers, layout, navigation, and login shell`)  
**Prior:** Batch 1 PARTIAL — App.tsx ~4,795 LOC

## Pre-check

| Check | Result |
|-------|--------|
| `npm run test:frontend-architecture` | PASS |
| `npm run lint` (`tsc --noEmit`) | PASS |
| `npm run build` | PASS |
| `git diff --check` | PASS |
| Agent regression | Skipped — env may lack DATABASE_URL (documented, not faked) |

## App.tsx metrics (Batch 2 start)

| Metric | Value |
|--------|------:|
| LOC | 4,795 |
| `useState` matches | 56 |
| `useEffect` matches | 11 |
| API-related import/call surface | ~15 |
| Tabs still JSX-inlined in App | dashboard, crm, properties, posts, inbox, chatbot, chats, automations, users, profile, integrations, settings, + SEO/AI/investor lazy panels |

## Batch 2 inventory findings

| Feature | Already outside App? | Batch 2 action |
|---------|----------------------|----------------|
| Settings | No — ~336 LOC JSX + handlers in App | Extract `features/settings` |
| Integrations | No — ~70 LOC in App | Extract `features/integrations` |
| Automations | No — ~65 LOC + state/handlers | Extract `features/automations` |
| Profile | Thin AdminProfilePanel wrapper in App | Extract `features/profile` page |
| Agent Sources | Yes — `components/agent/AgentSources.tsx` | Move → `features/agent/sources` + lazy section |
| Agent Missions | Yes — component | Move → features + lazy |
| Agent Jobs | Yes — component | Move → features + lazy |
| Notifications | Yes — component | Move → features + lazy |
| Sessions | Yes — `BrowserSessions.tsx` | Move → features + lazy |
| Reports | Yes — component | Move → features + lazy |
| Lead Intelligence / CRM / Inventory | Out of scope | Do **not** extract this batch |

## Notes

- Performance pieces (`getBootstrapData`, `navigationCounts`, `loadModuleForTab`, lazy panels, `queryCache`) must stay wired.
- Agent feature pages already own their own state/fetch; App only mounts `AgentPlatformPage`. Moving into `features/` + per-section `React.lazy` is real ownership, not wrappers.
- Settings remains shared lightly in App for header AI badge / project catalog — page owns its draft + save, App receives `onSettingsSaved`.
