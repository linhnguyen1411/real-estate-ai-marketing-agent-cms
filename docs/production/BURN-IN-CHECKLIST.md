# 24H BURN-IN CHECKLIST

**Start after:** O1 READY  
**Baseline time (UTC+7):** 2026-07-19 ~18:50  
**Target end:** +24 hours  
**Linked:** `OPERATIONS-RECOVERY.md`, `PRODUCTION-BURN-IN.md`

---

## Pre-flight (must all be yes)

- [x] VPS health OK (`https://bdsdanang.site/api/health`)
- [x] Disk &lt; 75% (baseline **51%**)
- [x] Telegram `getMe` / console polling without sustained timeouts
- [x] Execution Agent heartbeats to VPS (`exec-linhmsc-o1`)
- [x] Runtime Snapshot fields present (host/process/chrome/jobs)
- [x] Local scan worker heartbeat fresh
- [x] Sync `dead_letter` = 0 (discarded aged rows)

---

## Sampling every 4–6 hours

| Time | VPS health | Disk % | TG poll OK | Agent hb age | Agent RSS MB | Local worker hb | Queue wait/run | Outbox DLQ | Notes |
|------|------------|--------|------------|--------------|--------------|-----------------|----------------|------------|-------|
| T0 | OK | 51 | OK | &lt;30s | ~127 | OK | — | 0 | O1 baseline |
| +4h | | | | | | | | | |
| +8h | | | | | | | | | |
| +12h | | | | | | | | | |
| +18h | | | | | | | | | |
| +24h | | | | | | | | | |

### Quick commands

```bash
# VPS
curl -fsS https://bdsdanang.site/api/health
df -h /
pm2 logs real-estate-ai-cms --lines 30 --nostream | grep telegram-console

# Local
# check worker BrowserSession heartbeat + automation-agent log
```

Telegram: `/health` `/runtime` `/agent` `/browser` `/jobs`

---

## Pass criteria

- [ ] No CMS crash loop
- [ ] Agent heartbeat age &lt; 60s across samples
- [ ] Agent RSS not unbounded (+50% without workload jump)
- [ ] Telegram poll stable (no multi-hour timeout storms)
- [ ] Disk stays &lt; 80%
- [ ] dead_letter does not grow
- [ ] Local scanner continues completing jobs

**Close-out:** mark PASS/FAIL here and update production verdict if needed.
