# AI Agent — Facebook Group Reader

> Chỉ đọc group mà tài khoản **đã có quyền xem**. Không like/comment/post. Không bypass security.

## Browser cho Facebook = CDP (khuyến nghị)

Facebook không ổn định trong browser do agent tự launch. Dùng Chrome do người dùng mở + remote debugging.

Chi tiết: [`AI-AGENT-BROWSER-MODES.md`](./AI-AGENT-BROWSER-MODES.md)

### Quy trình

1. Mở Chrome (profile riêng + port 9222):

```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --remote-debugging-port=9222 `
  --user-data-dir="C:\ai-agent\chrome-profile"
```

2. Đăng nhập Facebook thủ công (2FA/checkpoint tự xử lý). Mở group cần đọc.
3. `.env`:

```env
AGENT_BROWSER_MODE=cdp
AGENT_CDP_ENDPOINT=http://127.0.0.1:9222
```

4. `npm run agent:check-facebook-session` → `logged_in`
5. `npm run agent:worker` — attach CDP, không đóng Chrome khi dừng worker.
6. Tạo `AgentSource` `type: facebook_group` + URL group → enqueue scan.

Override mode (hiếm): `source.config.browserMode = "managed" | "cdp"`.

### Managed login (không khuyến nghị cho FB)

`npm run agent:login` — persistent profile `AGENT_BROWSER_PROFILE_DIR`, không autofill.
Nếu Facebook vẫn từ chối → chuyển CDP, **không** thêm stealth.

---

## Auth / needs_login

Detector kết hợp URL + form login + checkpoint/challenge signals.

| State | Hành vi |
|-------|---------|
| `login_required` / `checkpoint` / `challenge` / `unknown` | Dừng job, `needs_login`, notification, không retry nhanh |
| `logged_in` | Tiếp tục scan |

Error codes: `FACEBOOK_LOGIN_REQUIRED`, `FACEBOOK_CHECKPOINT`, `FACEBOOK_CHALLENGE`, `FACEBOOK_SESSION_UNKNOWN`, `CDP_UNREACHABLE`, `CDP_NO_CONTEXT`.

---

## Scan / incremental

Defaults (`resolveFacebookScanConfig`):

| Key | Default |
|-----|---------|
| maxPosts | 100 |
| maxScrolls | 20 |
| maxEmptyPasses | 4 |
| scrollPauseMs | 2500 |
| loadWaitMs | 1500 |
| knownPostStopStreak | 8 |
| maxDurationSeconds | 180 |

Stop reasons: `max_posts` | `max_scrolls` | `max_duration` | `consecutive_empty_passes` | `known_post_streak` | auth (`login_required` / `checkpoint` / `challenge`).

Một empty pass **không** dừng scan — cần `maxEmptyPasses` pass liên tiếp không có unique post mới trong session. Sau mỗi scroll: pause + chờ tín hiệu feed (article count / externalId / URL / fingerprint).

Metrics: `articlesObserved`, `uniquePostsObserved`, `newPostsInserted`, `knownFromDatabase`, `duplicateInSession`, `parseFailed`, `ignoredByRule`, `analyzed`, `findingsCreated`, `notificationsCreated`.

Checkpoint chỉ ghi sau scan thành công (`recentExternalIds` / `recentCanonicalUrls` / `recentContentHashes` / `lastScanMetrics` / `lastStopReason`).

Test offline: `npm run test:facebook-checkpoint`.

---

## An toàn

| Cho phép | Không |
|----------|-------|
| Đọc feed group đã join | Like / comment / inbox |
| CDP attach localhost | Bypass captcha / checkpoint |
| needs_login + notify | Stealth / fingerprint spoof / ẩn webdriver |
