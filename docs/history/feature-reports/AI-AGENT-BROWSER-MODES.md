# AI Agent — Browser modes (managed vs CDP)

> Không stealth, không bypass captcha/checkpoint, không fake fingerprint, không ẩn `navigator.webdriver`.

## Hai chế độ

| Mode | Dùng cho | Cách mở browser |
|------|----------|-----------------|
| **managed** | Website / forum công khai | Worker `launchPersistentContext` + `channel: "chrome"` |
| **cdp** | Facebook (và site cần login thủ công) | User mở Chrome sẵn → worker `connectOverCDP` |

Mặc định theo source type (có thể override bằng `source.config.browserMode`):

```text
facebook_group → cdp
website / forum / search → managed
```

---

## Managed mode

```env
AGENT_BROWSER_MODE=managed
AGENT_BROWSER_PROFILE_DIR=./runtime/agent-browser-profile
AGENT_HEADLESS=false
```

- Profile được `path.resolve()` — **không** dùng Chrome User Data mặc định của Windows.
- Login: `npm run agent:login` (headed, maximized, **không autofill**).
- Đóng cửa sổ Chrome bình thường để flush cookie.
- Worker **được** đóng context managed khi shutdown (browser do worker sở hữu).

---

## CDP mode (Facebook)

### Fleet bootstrap (recommended)

One workstation = one Chrome CDP profile + one scan worker:

```powershell
# Windows
.\scripts\fleet\start-cdp-chrome.ps1
.\scripts\fleet\start-scan-worker.ps1
```

```bash
# Linux / macOS
bash scripts/fleet/start-cdp-chrome.sh
bash scripts/fleet/start-scan-worker.sh
```

See `scripts/fleet/README.md` for env overrides (`AGENT_MACHINE_ID`, ports, profiles).

### 1. Mở Chrome (Windows PowerShell)

Đóng mọi Chrome đang dùng cùng profile agent trước:

```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --remote-debugging-port=9222 `
  --user-data-dir="$PWD\runtime\agent-cdp-profile"
```

- `--user-data-dir` **riêng** — không trỏ vào `%LOCALAPPDATA%\Google\Chrome\User Data`.
- Tự đăng nhập Facebook + 2FA/checkpoint trong cửa sổ đó.
- **Giữ Chrome mở** khi chạy worker.
- Port **9222 chỉ localhost** — không expose firewall / nginx / public IP.

### 2. Env

```env
AGENT_BROWSER_MODE=cdp
AGENT_CDP_ENDPOINT=http://127.0.0.1:9222
```

Chỉ cho phép host: `127.0.0.1`, `localhost`, `::1`.

### 3. Kiểm tra session

```bash
npm run agent:check-facebook-session
```

Kỳ vọng `detectedState: "logged_in"`.

### 4. Worker

```bash
npm run agent:worker
```

- Attach CDP, tái sử dụng tab Facebook nếu có.
- Shutdown worker **không** đóng Chrome external.
- Concurrency Facebook/CDP = **1** (job khác nhận `CDP_BUSY` và được defer).

---

## Vì sao không dùng managed cho Facebook?

Facebook thường từ chối / không ổn định phiên trong browser do automation tự launch (Playwright persistent), kể cả `channel: "chrome"`.  
Khi đó **chuyển CDP** — không thêm stealth / anti-detection.

---

## Session states

`logged_in` | `login_required` | `checkpoint` | `challenge` | `unknown`  

`unknown` **không** được coi là logged in.

Khi không `logged_in`: `BrowserSession.status = needs_login`, job dừng, error code an toàn (`FACEBOOK_*` / `CDP_*`), notification nội bộ, **không** retry nhanh.

---

## Scripts

| Script | Vai trò |
|--------|---------|
| `scripts/fleet/start-cdp-chrome.(sh\|ps1)` | Chrome CDP Facebook profile |
| `scripts/fleet/start-scan-worker.(sh\|ps1)` | Local worker + CDP attach |
| `npm run agent:login` | Managed login only |
| `npm run agent:check-facebook-session` | Probe session (managed hoặc CDP) |
| `npm run agent:worker` | Claim jobs; mode theo source |

---

## An toàn

- Không log cookie / localStorage / password / WS debugger URL đầy đủ.
- BrowserSession metadata chỉ: `mode`, `browserChannel`, `endpointHost`, `endpointPort`.
