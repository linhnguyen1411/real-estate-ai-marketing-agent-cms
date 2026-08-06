# Engineering Constitution — Quick Reference

> Condensed from `ENGINEERING_CONSTITUTION.md` v2.1 for everyday use. Read the full file (or the
> exact ADR named below) only when this quickref tells you the task touches that specific decision.

**North Star:** Generate Qualified Buyers Automatically. Not optimizing for CMS/CRM/bot-as-goal.
Every non-trivial feature should be able to answer: *how does this create a Qualified Buyer?*

**Flow for non-trivial work:** Architecture Audit → Impact Analysis → Implement → Cleanup → Report.
(Full Prompt Policy gate — Constitution/ADR read, KPI tier, Business Goal — only needed for
genuinely new features or cross-module refactors; skip the ceremony for bugfixes/small work.)

**Runtime Boundary:** Never touch Runtime / Fleet / Queue / Browser / Scheduler / Publisher Runtime
without explicit confirmation. See `00-runtime-boundary.mdc`.

**No duplicate modules:** before adding a new service/util, check if one already exists doing the
same job. No unauthorized `V2`/`New` file variants.

**Coding standard (short version):**
- kebab-case folders, role-suffix filenames (`traceService.ts`), PascalCase types, verb-first camelCase functions
- Comment *why*, not *what*; no commented-out code
- No `console.log` debug, no secrets, no full prompt dumps in logs
- Temporary/experimental/flagged code needs Owner + Created + Expires + removal plan

**Clean Repository (do this before merging, not just when someone finally asks):**
Dead docs, dead scripts, dead components, dead APIs, dead tests, obsolete prompts → remove or
explicitly log as Technical Debt with a plan. This is the check that has been skipped repeatedly —
see `01-repo-cleanup-proposal.md` for the current backlog it created.

**When to actually open a full doc instead of this quickref:**
- Touching Fleet/Browser/Scheduler internals → read the specific `docs/architecture/*` file for
  that subsystem (now archived under `docs/archive/architecture/`, still there for reference).
- Touching a decision explicitly recorded in an ADR (stateless execution, browser lease, decision
  engine, knowledge center, campaign workspace) → read that one `docs/adr/ADR-*.md`, not all 8.
- Changing product scope/positioning → see `20-product-context.mdc`.
