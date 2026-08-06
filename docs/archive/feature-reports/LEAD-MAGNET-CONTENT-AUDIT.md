# Lead Magnet Content Audit

Generated: 2026-06-28T05:31:09.874Z

## Validation rules

1. Pairwise Jaccard similarity between text blocks must be **≤ 25%**.
2. Commercial balance: **FPT mentions ≤ Sun Group + Mai Đăng Chơn**; Sun/Mai/Nam appear before FPT in corpus.

## Result

**FAIL** — see details below.

- Text blocks scanned: **88**
- Similarity failures: **54**
- Commercial balance: **PASS** — Sun 42 + Mai 34 ≥ FPT 12; KPI thứ tự nhớ: Sun → Mai → Nam trước FPT.
- Mentions — Sun: **42**, Mai Đăng Chơn: **34**, FPT: **12**, Nam Đà Nẵng: **7**

## Failures

| Block A | Block B | Similarity |
|---------|---------|------------|
| `chapter-land:land-shophouse:summary` | `chapter-townhouse:th-shophouse:summary` | 55.8% |
| `chapter-land:land-shophouse:insight` | `chapter-townhouse:th-shophouse:insight` | 54.3% |
| `chapter-land:land-shophouse:insight` | `chapter-townhouse:th-shophouse:summary` | 45.9% |
| `ch1-infra` | `chapter-drivers:driver-metro:summary` | 38.3% |
| `ch1-fpt` | `chapter-drivers:driver-market:summary` | 38.2% |
| `ch1-fpt` | `ch4-business` | 35.1% |
| `ch4-business` | `chapter-drivers:driver-market:summary` | 34.6% |
| `ch2-spana` | `ch2-fireworks` | 33.3% |
| `ch1-hoa-quy` | `ch4-business` | 31.6% |
| `ch1-hoa-quy` | `chapter-drivers:driver-fpt:summary` | 31.3% |
| `chapter-land:land-shophouse:summary` | `chapter-townhouse:th-commercial-land:summary` | 31.3% |
| `ch1-nam-hoa-xuan` | `ch3-hoa-quy` | 29.8% |
| `ch1-hoa-quy` | `chapter-drivers:driver-market:summary` | 29.6% |
| `chapter-land:land-shophouse:summary` | `chapter-townhouse:th-shophouse:insight` | 29.6% |
| `ch2-symphony` | `chapter-apartment:apt-coastal:insight` | 28.6% |
| `ch2-symphony` | `chapter-apartment:apt-south:insight` | 28.5% |
| `ch2-riverside` | `chapter-apartment:apt-riverside:summary` | 28.2% |
| `ch2-shophouse` | `chapter-townhouse:th-shophouse:summary` | 28.0% |
| `ch1-fpt` | `chapter-drivers:driver-fpt:insight` | 27.8% |
| `ch2-shophouse` | `chapter-drivers:driver-market:insight` | 27.7% |
| `chapter-apartment:apt-coastal:summary` | `chapter-land:land-frontage:summary` | 27.7% |
| `ch2-symphony` | `chapter-apartment:apt-coastal:summary` | 27.5% |
| `ch2-symphony` | `ch2-fours` | 27.2% |
| `ch1-hoa-quy` | `ch1-fpt` | 27.1% |
| `ch1-fpt` | `chapter-drivers:driver-fpt:summary` | 27.1% |
| `chapter-land:land-accumulation:insight` | `chapter-townhouse:th-shophouse:insight` | 27.0% |
| `ch1-mai-dang-chon` | `chapter-townhouse:th-shophouse:summary` | 26.9% |
| `ch2-symphony` | `chapter-apartment:apt-riverside:summary` | 26.9% |
| `ch2-cora` | `chapter-apartment:apt-coastal:summary` | 26.9% |
| `ch2-cora` | `chapter-apartment:apt-coastal:insight` | 26.8% |
| `ch1-hoa-quy` | `chapter-drivers:driver-fpt:insight` | 26.7% |
| `ch2-symphony` | `ch2-spana` | 26.7% |
| `chapter-apartment:apt-shophouse-pod:summary` | `chapter-drivers:driver-coastal:summary` | 26.7% |
| `ch2-symphony` | `chapter-apartment:apt-south:summary` | 26.6% |
| `ch2-slight` | `ch2-fours` | 26.5% |
| `chapter-land:land-shophouse:summary` | `chapter-townhouse:th-live:summary` | 26.3% |
| `ch1-nam-hoa-xuan` | `chapter-townhouse:th-live:summary` | 26.0% |
| `ch3-mai-dang-chon` | `chapter-townhouse:th-shophouse:summary` | 25.9% |
| `chapter-apartment:apt-shophouse-pod:summary` | `chapter-drivers:driver-fpt:summary` | 25.9% |
| `ch1-hoa-quy` | `chapter-drivers:driver-university:summary` | 25.8% |
| `ch2-symphony` | `chapter-land:land-accumulation:insight` | 25.8% |
| `ch2-fours` | `chapter-apartment:apt-riverside:summary` | 25.8% |
| `ch2-spana` | `chapter-apartment:apt-south:insight` | 25.8% |
| `chapter-apartment:apt-riverside:summary` | `chapter-drivers:driver-fpt:summary` | 25.8% |
| `ch2-symphony` | `ch2-slight` | 25.7% |
| `chapter-land:land-accumulation:insight` | `chapter-drivers:driver-metro:insight` | 25.7% |
| `ch1-mai-dang-chon` | `ch3-mai-dang-chon` | 25.6% |
| `ch1-fpt` | `chapter-drivers:driver-university:summary` | 25.6% |
| `ch3-mai-dang-chon` | `chapter-land:land-shophouse:summary` | 25.5% |
| `ch2-slight` | `chapter-apartment:apt-riverside:summary` | 25.4% |
| `ch1-intro` | `chapter-apartment:apt-riverside:summary` | 25.3% |
| `ch1-mai-dang-chon` | `chapter-land:land-shophouse:insight` | 25.3% |
| `ch2-symphony` | `chapter-apartment:apt-shophouse-retail:summary` | 25.2% |
| `chapter-apartment:apt-riverside:summary` | `chapter-drivers:driver-metro:summary` | 25.2% |

## Magnets covered

- `bao-cao-nam-da-nang-2026` — budget framework, remote ops risks, 90-day checklist
- `top-20-co-hoi-dau-tu` — investment playbook (4 chapters, subsections + tables)
- `ban-do-dau-tu-nam-da-nang` — zone notes

