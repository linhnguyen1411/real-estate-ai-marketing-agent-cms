# Route Matrix & Authorization Audit

Date: 2026-10-04  
Auditor: Senior Security + Backend Engineer  
Branch: `fix/p0-baseline`  

Legend:
- **Auth?**: `Yes` (Requires Bearer token) | `No` (Publicly accessible) | `Key` (Requires static API / Agent token)
- **Role?**: `Any` | `Owner` | `Company+` (Owner & Company admin) | `Member+` (All authenticated roles)
- **Tenant-Scope?**: `Yes` (Scoped by `company_id` / `assigned_member_ids`) | `Global` (Platform-wide) | `N/A`
- **Validate Input?**: `Yes` (Structured / Validated) | `Partial` (Manual check) | `No` (Raw body used)

---

## 1. System & Public Endpoints

| Route | Auth? | Role? | Tenant-Scope? | Validate Input? | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET /api/health` | No | Any | N/A | N/A | Health check endpoint |
| `POST /api/auth/login` | No | Any | N/A | Partial | Credential check; plaintext password currently |
| `GET /api/auth/me` | Yes | Member+ | Yes | N/A | Returns authenticated user profile |
| `PUT /api/auth/profile` | Yes | Member+ | Yes | Partial | Updates self profile and slug |
| `GET /p/:propertySlug` | No | Any | N/A | Partial | SSR Mini Landing Page |
| `GET /sitemap.xml` | No | Any | N/A | N/A | Public SEO sitemap |
| `GET /api/public/properties` | No | Any | N/A | Partial | Public property directory |
| `GET /api/public/properties/:id` | No | Any | N/A | Partial | Single public property details |
| `POST /api/public/lead-magnets/:slug/claim` | No | Any | N/A | Partial | Lead magnet opt-in |
| `POST /api/public/chat/guest/message` | No | Any | N/A | Partial | Public AI guest chat |

---

## 2. Admin Resource Management

| Route | Auth? | Role? | Tenant-Scope? | Validate Input? | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET /api/customers` | Yes | Member+ | Yes | Partial | Scoped via `scopeCollection` |
| `POST /api/customers` | Yes | Member+ | Yes | Partial | Sets `accessDefaults` |
| `GET /api/customers/:id` | Yes | Member+ | Yes | Partial | Enforces `canAccessResource` |
| `PUT /api/customers/:id` | Yes | Member+ | Yes | Partial | Enforces `canManageResource` |
| `DELETE /api/customers/:id` | Yes | Company+ | Yes | Partial | Enforces `canManageResource` |
| `GET /api/properties` | Yes | Member+ | Yes | Partial | Scoped via `scopeCollection` |
| `POST /api/properties` | Yes | Member+ | Yes | Partial | Sets `accessDefaults` |
| `POST /api/properties/quick-parse` | Yes | Member+ | Yes | Partial | Parses raw text via NLP/Regex |
| `POST /api/properties/batch-import` | Yes | Member+ | Yes | Partial | Batch CSV/Excel import |
| `GET /api/properties/:id` | Yes | Member+ | Yes | Partial | Enforces `canAccessResource` |
| `PUT /api/properties/:id` | Yes | Member+ | Yes | Partial | Enforces `canManageResource` |
| `DELETE /api/properties/:id` | Yes | Company+ | Yes | Partial | Enforces `canManageResource` |
| `GET /api/posts` | Yes | Member+ | Yes | Partial | Scoped via `scopeCollection` |
| `POST /api/posts` | Yes | Member+ | Yes | Partial | Sets `accessDefaults` |
| `GET /api/posts/:id` | Yes | Member+ | Yes | Partial | Needs strict tenant IDOR assert |
| `PUT /api/posts/:id` | Yes | Member+ | Yes | Partial | Needs strict tenant IDOR assert |
| `DELETE /api/posts/:id` | Yes | Company+ | Yes | Partial | Needs strict tenant IDOR assert |
| `GET /api/inbox` | Yes | Member+ | Yes | Partial | Scoped via `scopeCollection` |
| `PUT /api/inbox/:id` | Yes | Member+ | Yes | Partial | Enforces `canAccessResource` |
| `GET /api/users` | Yes | Company+ | Yes | Partial | Scoped to own company |
| `POST /api/users` | Yes | Company+ | Yes | Partial | Needs escalation guard (role!=owner) |
| `PUT /api/users/:id` | Yes | Company+ | Yes | Partial | Needs escalation guard |
| `DELETE /api/users/:id` | Yes | Company+ | Yes | Partial | Prevent deleting self/owner |
| `GET /api/settings` | Yes | Company+ | Yes | Partial | System settings |
| `PUT /api/settings` | Yes | Owner | Global | Partial | Restricted to owner |

---

## 3. Agent & Autonomous Worker Endpoints (`server/agent/agentRoutes.ts`)

| Route | Auth? | Role? | Tenant-Scope? | Validate Input? | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET /api/agent/dashboard` | Yes | Member+ | Yes | N/A | Aggregated KPI counts |
| `GET /api/agent/sources` | Yes | Member+ | Yes | Partial | Scoped by `buildCompanyScopeFilter` |
| `POST /api/agent/sources` | Yes | Company+ | Yes | Partial | Enforces `canManageAgentConfig` |
| `PUT /api/agent/sources/:id` | Yes | Company+ | Yes | Partial | Enforces `canManageAgentConfig` |
| `DELETE /api/agent/sources/:id` | Yes | Company+ | Yes | Partial | Enforces `canManageAgentConfig` |
| `GET /api/agent/findings` | Yes | Member+ | Yes | Partial | Scoped list |
| `GET /api/agent/findings/:id` | Yes | Member+ | Yes | Partial | Needs IDOR check |
| `PUT /api/agent/findings/:id` | Yes | Member+ | Yes | Partial | Needs IDOR check |
| `POST /api/agent/findings/:id/promote` | Yes | Member+ | Yes | Partial | Promotes finding to lead |
| `GET /api/agent/jobs` | Yes | Member+ | Yes | Partial | Scoped list |
| `POST /api/agent/jobs/:id/cancel` | Yes | Company+ | Yes | Partial | Cancels queued task |
| `GET /api/agent/notifications` | Yes | Member+ | Yes | Partial | User/Company scoped |
| `PUT /api/agent/notifications/:id/read` | Yes | Member+ | Yes | Partial | Needs IDOR check |
| `POST /api/agent/action-proposals/:id/approve` | Yes | Company+ | Yes | Partial | Needs IDOR check |
| `POST /api/agent/runtime/heartbeat` | Key | Runtime | N/A | Partial | Authenticated via `AGENT_RUNTIME_TOKEN` |

---

## 4. AI Gateway & Chat Assistant

| Route | Auth? | Role? | Tenant-Scope? | Validate Input? | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `POST /api/ai/chat` | Yes | Member+ | Yes | Partial | AI generation endpoint; needs rate limit |
| `POST /api/chat/assistant` | Yes | Member+ | Yes | Partial | RAG-assisted assistant chat |
| `POST /api/planning/generate` | Yes | Company+ | Yes | Partial | Automated campaign planner |
