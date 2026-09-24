# R0 Final Smoke

**Source:** `cmrixp8hg0006yh2zzmohpfve` (Facebook group — BẤT ĐỘNG SẢN ĐÀ NẴNG)
**Job:** `cmrk336u40001pyuwm7ud0hzk`
**Result:** **PASS**

| Check | Result |
|-------|--------|
| queued → claimed → running → completed | yes (~25s) |
| browserPageMode | **reused** |
| contextPageCount | **10** (1 worker + ~9 user) |
| workerOwnedScanPages | **1** |
| scanPageCreated | 1 (process lifetime) |
| scanPageRecreatedAfterCrash | 0 |
| stopReason | `known_post_streak` |
| ScannedContent / Finding | created or deduped as expected |
| pending/failed outbox | 0 / 0 |
| Exception / modal crash | none observed |

Post-restart confirmation: same source completed again on new worker (`worker-LinhMSC-1776`) with `browserPageMode=reused`, `workerOwnedScanPages=1`.

Raw artifact (local only, not committed): `docs/refactor/_r0-smoke-raw.txt`
