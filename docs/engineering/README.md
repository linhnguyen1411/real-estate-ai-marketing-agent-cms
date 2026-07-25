# Engineering docs

Official project engineering standards (**Constitution v2.1 — FINAL LOCK** Operating System).

| Doc | Purpose |
|-----|---------|
| [ENGINEERING_CONSTITUTION.md](./ENGINEERING_CONSTITUTION.md) | Root law — read before every change (**do not grow rules**) |
| [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md) | Modules + Workspaces |
| [CODE_REVIEW_CHECKLIST.md](./CODE_REVIEW_CHECKLIST.md) | Pre-commit / PR + Release Quality Gate |
| [RELEASE_PROCESS.md](./RELEASE_PROCESS.md) | Deploy · Smoke · Rollback · Report |
| [ADR index](../adr/README.md) | Architecture Decision Records (evolution path) |
| [Evolution log](../evolution/README.md) | Sprint KPI progress |

**After v2.1:** architecture change → ADR. Constitution edits only for Product Philosophy / Engineering Principles.

**Cursor rules (alwaysApply):** `engineering-constitution`, `product-philosophy`, `runtime-boundary`, `architecture-first`, `impact-analysis`.

**Rule:** If a development prompt conflicts with the Constitution, warn before coding.
