# AI Agent — Draft reply queue (Sprint 8.1)

> **Không** tự động comment / inbox / post. AI soạn → người duyệt.

## Models

### `AgentActionProposal` → `agent_action_proposals`

| Field | Notes |
|-------|--------|
| findingId | FK finding |
| actionType | `comment` \| `message` \| `save` \| `follow_up` |
| draftText / rationale / riskLevel | `low` \| `medium` \| `high` |
| status | `proposed` \| `approved` \| `rejected` \| `executed` \| `failed` |
| approvedBy / approvedAt | set on approve |
| executedAt / result | reserved — chưa dùng để đăng MXH |

### `AgentActionAuditLog` → `agent_action_audit_logs`

Actions: `created`, `draft_updated`, `approved`, `rejected`, `copied`.

---

## Flow

1. Findings → **Tạo phản hồi** → AI tạo 1–3 draft (fallback deterministic nếu AI lỗi)
2. `/admin/agents/proposals` — sửa / approve / reject
3. **Copy text** hoặc **Copy + approve** — clipboard only, không post Facebook
4. Audit log trên mỗi thao tác

Prompt AI cấm giả danh, cấm hứa thông tin chưa xác minh.

---

## API

| Method | Path |
|--------|------|
| POST | `/api/agent/findings/:id/action-proposals` `{ actionType?, count? }` |
| GET | `/api/agent/action-proposals` |
| GET | `/api/agent/action-proposals/:id` |
| PATCH | `/api/agent/action-proposals/:id` (chỉ `proposed`) |
| POST | `/api/agent/action-proposals/:id/approve` |
| POST | `/api/agent/action-proposals/:id/reject` |
| POST | `/api/agent/action-proposals/:id/copy` `{ markApproved? }` |
| GET | `/api/agent/action-proposals/:id/audits` |

---

## Schema apply

```bash
npx prisma db push
# hoặc
npx prisma migrate deploy
```
