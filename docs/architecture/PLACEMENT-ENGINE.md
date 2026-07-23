# Placement Engine (G2)

Scores **(job × agent)** for soft claim selection.

## Inputs

- Job requirements (capabilities, browser, affinity, pin, priority)
- Fleet agent snapshot (caps, load, CPU/RAM, browsers, activity)
- Policy mode (spread / pack / affinity / energy / pin / drain / maintenance)
- Reservation & cooldown stores

## Score breakdown

| Factor | Role |
|--------|------|
| capability | Hard filter + preferred caps |
| browser | Required/preferred profile, healthy/free |
| load | Running/slots, CPU, RAM, idle boost |
| affinity | Sticky hostname / last agent / pin |
| priority | Queue priority + type boost (publish > scan) |
| policy | Spread idle machines vs pack busy ones |

## Hard rejects

`maintenance` · `drain` · `cooldown` · `reserved_for_other` · `missing_caps` · `required_browser_*` · `pin_mismatch`

## Claim integration

1. Load fleet snapshot **outside** DB transaction  
2. `SELECT … FOR UPDATE SKIP LOCKED` candidate window (40)  
3. `planClaimForAgent` → best `jobId`  
4. `UPDATE` claim + emit `JOB_CLAIMED` with placement payload  

Fallback: first capable row if planner throws.
