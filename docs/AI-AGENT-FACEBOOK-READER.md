# AI Agent — Facebook Group Reader (Sprint 5.1)

> **MVP quan sát** — chỉ đọc bài trong group bằng profile đã đăng nhập thủ công.  
> **Không** like/comment/inbox/post. **Không** bypass captcha/checkpoint/fingerprint.

---

## Yêu cầu trước khi chạy

1. `npm run agent:install-browser`
2. `npm run agent:login` — đăng nhập Facebook trong Chromium headed
3. Tạo `AgentSource` với `type: facebook_group` và URL group (`https://www.facebook.com/groups/...`)
4. `npm run agent:worker` hoặc debug script (bên dưới)

Cookies nằm trong `AGENT_BROWSER_PROFILE_DIR` (gitignored). **Không** lưu password vào DB.

---

## Module layout

```
server/agent-worker/
  adapters/facebookGroupAdapter.ts   — orchestration scan_source
  facebook/
    facebookSelectors.ts             — selectors tập trung (@calibrate)
    facebookCheckpointDetector.ts    — login/checkpoint/captcha
    facebookSessionGuard.ts          — needs_login + notification + debug shots
    facebookDomParser.ts             — parse [role=article] posts
    facebookScrollController.ts      — scroll + feed tab
```

---

## Luồng scan

1. Mở `AgentSource.url` (group)
2. `detectFacebookAuthBlock` — nếu blocked → dừng job, `BrowserSession.status = needs_login`, tạo notification
3. Chuyển feed tab nếu `config.feedTab` (discussion/new/featured) — defensive nếu không tìm thấy tab
4. Vòng lặp:
   - Click **Xem thêm / See more** (giới hạn)
   - Parse posts hiển thị (`role=article`)
   - Dedupe: `externalId` → `contentHash`
   - Lưu `ScannedContent`, keyword finding + lead analysis (Sprint 4.1)
   - Dừng khi: N bài đã tồn tại liên tiếp, `maxPosts`, `maxScrolls`, `maxDurationSeconds`
   - Cuộn feed
5. Cập nhật `AgentSource.checkpoint` + `lastScannedAt`

---

## Source config

```json
{
  "maxScrolls": 8,
  "maxPosts": 25,
  "maxDurationSeconds": 120,
  "stopAfterKnownPosts": 5,
  "feedTab": "discussion",
  "pageTimeoutMs": 45000,
  "maxContentChars": 12000,
  "scrollPauseMs": 1500
}
```

| Key | Mặc định | Mô tả |
|-----|----------|--------|
| `maxScrolls` | 8 | Số lần cuộn |
| `maxPosts` | 25 | Tối đa bài parse mỗi job |
| `maxDurationSeconds` | 120 | Timeout tổng |
| `stopAfterKnownPosts` | 5 | Dừng sau N bài trùng liên tiếp |
| `feedTab` | `default` | `discussion` \| `new` \| `featured` |

---

## Post fields

| Field | Nguồn |
|-------|--------|
| `externalId` | Permalink `/posts/{id}` hoặc `story_fbid` |
| `canonicalUrl` | Permalink bài |
| `authorName` / `authorUrl` | Link tác giả trong article |
| `contentText` | Body sau expand |
| `publishedLabel` | `abbr` / aria-label thời gian |
| `metrics` | likes/comments/shares (regex trên text) |
| `rawData` | metadata tối thiểu, `platform: facebook` |

Chống trùng: `ScannedContent` unique `(sourceId, contentHash)` + tra `externalId` trước khi insert.

---

## Auth / checkpoint

Khi phát hiện login, checkpoint hoặc captcha:

- Job **dừng** (throw `FacebookAuthBlockedError`)
- `browser_sessions.status = needs_login`
- Notification `browser_needs_login` (dedupe `eventKey`)
- Screenshot debug nếu `AGENT_FB_DEBUG_SCREENSHOTS=1` → `data/browser-debug/` (gitignored)

**Không** tự giải captcha hoặc vượt checkpoint.

---

## Job result metrics

Ngoài metrics chung (`contentsSeen`, `contentsInserted`, …):

```json
{
  "scrollsPerformed": 6,
  "postsParsed": 18,
  "seeMoreClicks": 4,
  "knownPostsStreak": 5,
  "stoppedReason": "known_posts",
  "feedTabSwitched": true,
  "checkpointUpdated": true
}
```

---

## Debug một source

```bash
AGENT_SOURCE_ID=<agent-source-cuid> npm run agent:debug-facebook
```

Đọc URL từ DB — không hardcode account/URL trong script.

---

## Selector calibration (@calibrate)

Facebook DOM thay đổi thường xuyên. Sprint 5.1 triển khai **defensive**:

- Ưu tiên `[role="article"]`, `role=tab`, nút text **Xem thêm/See more**
- Tránh class hash; fallback `div[dir="auto"]` có thể nhiễu
- `rawData.needsCalibration: true` trên mỗi post

**Chưa xác nhận** parse thành công trên production Facebook trong môi trường CI — cần hiệu chỉnh selector sau khi login thật.

---

## An toàn MVP

| Cho phép | Không cho phép |
|----------|----------------|
| Mở group | Like / comment |
| Đọc feed hiển thị | Inbox / kết bạn |
| Click Xem thêm | Đăng bài |
| Cuộn giới hạn | Bypass captcha/checkpoint |
| Lưu bài mới | Spoof fingerprint |

---

## Kiểm tra

```bash
npm run lint
npm run build
```

E2E thủ công: login → tạo source `facebook_group` → `POST /api/agent/sources/:id/run` → xem Jobs / Findings / Sessions.
