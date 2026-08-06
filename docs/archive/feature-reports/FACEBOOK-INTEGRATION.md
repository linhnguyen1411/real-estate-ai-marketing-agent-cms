# Facebook Fanpage Integration — Phase 30 Sprint 1

Đồng bộ Messenger inbox + comment Fanpage vào CMS `bdsdanang.site`. Sprint 1 **không** bật AI auto reply.

---

## Meta App setup

1. Tạo app tại [Meta for Developers](https://developers.facebook.com/)
2. Thêm sản phẩm **Messenger** và **Webhooks**
3. Kết nối Fanpage Estoria với app
4. Lấy:
   - App ID / App Secret
   - Page ID
   - Page Access Token (long-lived)

### Env variables

```env
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=
FACEBOOK_PAGE_ID=830631276801874
FACEBOOK_PAGE_ACCESS_TOKEN=
FACEBOOK_VERIFY_TOKEN=estoria_verify_2026
FACEBOOK_GRAPH_VERSION=v25.0
FACEBOOK_TOKEN_ENCRYPTION_KEY=   # optional; uses AUTH_SECRET if empty
```

Không commit token vào git. Production: set env trên VPS / PM2.

### Test connection CLI

```bash
npm run fb:test
```

Kết nối OK sẽ in:

```
Facebook Page Connected:
  id:   830631276801874
  name: Estoria - Chuyên BĐS Đà Nẵng - Căn Hộ Cao Cấp
```

---

## Required permissions (Sprint 1)

| Permission | Mục đích |
|------------|----------|
| `pages_messaging` | Nhận tin Messenger |
| `pages_manage_metadata` | Webhook subscription |
| `pages_read_engagement` | Comment / reaction feed |
| `pages_show_list` | Liệt kê page |

Private reply (tùy chọn Sprint sau): `pages_messaging` + comment trong cửa sổ hợp lệ theo Meta.

---

## Webhook configuration

**Callback URL (production):**

```
https://bdsdanang.site/webhooks/facebook
```

**Verify token:** giá trị `FACEBOOK_VERIFY_TOKEN` trong env.

**Subscribe fields:**

- `messages`
- `messaging_postbacks`
- `messaging_optins` (nếu dùng)
- `feed` (comments, reactions)

### Verify flow

```
GET /webhooks/facebook?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
→ trả về challenge nếu token khớp
```

### Event flow

```
POST /webhooks/facebook
→ lưu raw payload (facebook_webhook_logs)
→ trả 200 ngay (EVENT_RECEIVED)
→ xử lý async: parser → contact → conversation → lead
```

---

## Local test with ngrok

Meta yêu cầu HTTPS public URL.

```bash
npm run dev
ngrok http 3000
```

Webhook URL:

```
https://<subdomain>.ngrok-free.app/webhooks/facebook
```

1. Set env `FACEBOOK_VERIFY_TOKEN` local
2. Meta Developer Console → Webhooks → Verify & Save
3. Gửi tin nhắn thử tới Fanpage
4. Admin → **Kênh Facebook** → tab Inbox

### Sample payloads (test manual)

**Messenger message:**

```json
{
  "object": "page",
  "entry": [{
    "id": "PAGE_ID",
    "time": 1710000000,
    "messaging": [{
      "sender": { "id": "USER_PSID" },
      "recipient": { "id": "PAGE_ID" },
      "timestamp": 1710000000,
      "message": {
        "mid": "m_test123",
        "text": "Cho em xin bảng giá căn Symphony"
      }
    }]
  }]
}
```

**Comment:**

```json
{
  "object": "page",
  "entry": [{
    "id": "PAGE_ID",
    "changes": [{
      "field": "feed",
      "value": {
        "item": "comment",
        "verb": "add",
        "comment_id": "COMMENT_ID",
        "post_id": "POST_ID",
        "message": "Em quan tâm căn hộ ven sông",
        "from": { "id": "USER_ID", "name": "Test User" },
        "created_time": 1710000000
      }
    }]
  }]
}
```

POST tới `/webhooks/facebook` với `Content-Type: application/json`.

---

## Admin UI

Menu: **Kênh Facebook**

| Tab | Nội dung |
|-----|----------|
| Connection Test | Page ID, name, token status, nút Test connection |
| Inbox | Hội thoại Messenger, timeline, lead score, tạo lead |
| Comments | Comment bài viết, intent tags, private reply eligibility |
| Leads | Lead Facebook (`sourceChannel=facebook`) |

API (JWT required):

- `GET /api/admin/facebook/test-connection`

- `GET /api/facebook/inbox`
- `GET /api/facebook/inbox/:id`
- `PATCH /api/facebook/inbox/:id/status`
- `GET /api/facebook/comments`
- `PATCH /api/facebook/comments/:id/status`
- `POST /api/facebook/comments/:id/create-lead`
- `GET /api/facebook/leads`
- `POST /api/facebook/conversations/:id/create-lead`

---

## Database models

- `facebook_page_connections` — token mã hóa
- `facebook_contacts` — PSID / profile
- `facebook_conversations` — messenger threads
- `facebook_messages` — tin nhắn + raw payload
- `facebook_interactions` — comment / reaction / like
- `facebook_webhook_events` — raw webhook + processed flag
- `facebook_webhook_logs` — legacy debug log
- `leads` — bổ sung field `facebook_*`, `sourceChannel`, `sourceType`, `firstMessage`

Migration:

```bash
npx prisma db push
# hoặc production:
npx prisma migrate deploy
```

---

## Intent detection (keyword, no AI)

Comment có keyword high-intent (`giá`, `quan tâm`, `tư vấn`, …) hoặc product (`Symphony`, `Mai Đăng Chơn`, …) → tạo lead sơ bộ + tags.

Messenger message → luôn tạo lead sơ bộ (score ~15).

---

## Policy notes (bắt buộc)

| Hành vi | Sprint 1 |
|---------|----------|
| Khách nhắn Page | ✅ Lưu + lead |
| Khách comment có intent | ✅ Lưu + lead |
| Khách chỉ like Page | ❌ Chỉ lưu interaction, **không** inbox |
| Khách chỉ like/reaction bài | ❌ Chỉ lưu interaction, **không** inbox |
| AI auto reply | ❌ Chưa bật |
| Private reply tự động | ❌ Chưa bật |

---

## Production deploy checklist

- [ ] Set Facebook env trên VPS
- [ ] `npx prisma db push` hoặc migrate
- [ ] `npm run build` + `pm2 restart`
- [ ] Meta Webhooks → production URL
- [ ] Verify webhook OK
- [ ] Test message + comment thật
- [ ] Kiểm tra Admin → Kênh Facebook
- [ ] Không log `FACEBOOK_PAGE_ACCESS_TOKEN` trong PM2 logs

---

## Troubleshooting

| Vấn đề | Gợi ý |
|--------|-------|
| Verify failed | Kiểm tra `FACEBOOK_VERIFY_TOKEN` khớp Meta Console |
| 403 POST | Kiểm tra `FACEBOOK_APP_SECRET` + header `X-Hub-Signature-256` |
| Không thấy inbox | Webhook subscribed `messages`? Page token đúng page? |
| Comment không vào | Subscribe field `feed` |
| Token encrypt error | Set `AUTH_SECRET` hoặc `FACEBOOK_TOKEN_ENCRYPTION_KEY` |
