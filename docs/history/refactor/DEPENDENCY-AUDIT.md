# Dependency Audit

**Date:** 2026-07-14 · no major upgrades · no `npm audit fix --force`.

| Package | Used by | Env | Risk | Action |
|---------|---------|-----|------|--------|
| `@prisma/client` / `prisma` | DB | prod | low | keep |
| `express` `compression` `dotenv` `pg` | API | prod | low | keep |
| `playwright` | worker | worker | size | keep |
| `@google/genai` | AI | prod | low | keep |
| react / vite / markdown stack | UI | prod | low | keep |
| `gray-matter` `marked` | blog pipeline | prod | low | keep |
| **`motion`** | none | — | — | **removed R0** |
| `autoprefixer` | unclear w/ Tailwind v4 | dev | low | investigate later |
| Telegram npm bot | N/A (HTTP direct) | — | — | keep pattern |

## npm audit (omit=dev)

Reference only — 4 vulns reported after motion remove (1 low, 2 moderate, 1 high). Do not force-fix majors in R0.
