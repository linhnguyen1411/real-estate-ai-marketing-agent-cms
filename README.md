# Real Estate AI Marketing Agent CMS

H? th?ng qu?n tr? n?i dung (CMS), qu?n l� kh�ch h�ng (CRM) v� T? ??ng h�a ti?p th? t�ch h?p **AI Agent chuy�n s�u cho Marketing B?t ??ng s?n** t?i Vi?t Nam.

?ng d?ng h? tr? c�c nh� ph�t tri?n b?t ??ng s?n v� ??i l� m�i gi?i t? ??ng h�a to�n b? quy tr�nh t? kh�u thu th?p th�ng tin nh� ??t, t?o v� v�n k?ch b?n qu?ng c�o ?a k�nh, ph�n lo?i � ??nh inbox c?a kh�ch h�ng, cho ??n ch?m ?i?m ti?m n?ng v� t? v?n th�ng minh.

---

## ?? T�nh n?ng n?i b?t (Features)

1. **Dashboard T?ng Quan**: Tr?c quan h�a s? l??ng kh�ch h�ng, c? c?u r? h�ng, t? l? hi?u su?t ph?u marketing ?a n?n t?ng (Facebook, Zalo, Tiktok, Website) v� nh?t k� v?n h�nh live-system.
2. **Qu?n l� kh�ch h�ng CRM**: L?u tr? th�ng tin chi ti?t kh�ch, ng�n s�ch t�i ch�nh, ghi ch� h�nh vi v� n�t k�ch ho?t **AI ph�n t�ch t�m l�, t? ??ng t�m l??c v� ch?m ?i?m ti?m n?ng (lead score)**.
3. **Qu?n l� B?t ??ng s?n**: L?u tr? r? th�ng tin nh� ph?, ??t n?n s�ng bi?n, shophouse c?c tr?c quan v� t�nh n?ng **AI sinh n?i dung k?ch b?n marketing 4 k�nh** (Zalo, Facebook, TikTok, Blog SEO) k�m Prompt nhi?p ?nh & cinematic video.
4. **AI Content Generator**: Trung t�m ??u n�o t�y � ch?n m?c ?? v?n phong (Sang tr?ng, Viral t?u h�i, Thuy?t ph?c kh?n tr??ng) ?? Agent s�ng t?o b�i ??ng t�y bi?n.
5. **CMS ??ng b�i**: B?n nh�p l?u tr? t? ??ng, gi? l?p th?ng k� s? li?u ti?p c?n th?c t? c?a d? �n.
6. **Inbox ?a K�nh**: Giao di?n t?p trung h�a tin nh?n ?a n?n t?ng, **AI ph�n lo?i � ??** (h?i v? tr�, h?i gi�, th??ng l??ng) v� ?? xu?t k?ch b?n ph?n h?i kh�ch c?c k? nh?y b�n.
7. **Chatbot AI n?i b?**: Ng??i d�ng c� th? h?i tr?c ti?p h? th?ng b?ng ng�n ng? t? nhi�n v? t�nh tr?ng gi? h�ng ("C?n n�o ? c?u R?ng?"), t�m t?t th�ng tin kh�ch ho?c ?? xu?t chi?n d?ch trong tu?n.
8. **Si�u t? ??ng h�a (Automation Center)**: M� ph?ng workflow t? ??ng (th�m B?S m?i t? t?o 3 b�i vi?t; ch?m kh�ch ??t score > 80 t? chuy?n th�nh lead v�ng v� giao vi?c cho sale).

---

## ?? C?u tr�c m� ngu?n (Project Architecture)

```text
??? /backend            # M� ngu?n backend tham kh?o ?a ng�n ng?
?   ??? app.rb          # Sinatra API ch�nh (Ruby)
?   ??? app.py          # FastAPI API ch�nh (Python)
??? /server             # M� ngu?n Backend Node.js ph?c v? API ? AI Studio (TypeScript)
?   ??? aiService.ts    # Service t�ch h?p Gemini API / Ollama API
?   ??? dbHelper.ts     # Tr�nh qu?n l� ??c ghi PostgreSQL (Prisma) an to�n
??? /src                # M� ngu?n Frontend React
?   ??? App.tsx         # Dashboard UI ch�nh v� c�ng hi?n ??i, tr?c quan
?   ??? types.ts        # C�c ki?u d? li?u Typescript ch?t ch?
?   ??? index.css       # Import Tailwind CSS
??? db.json             # C? s? d? li?u m?u chu?n h�a v?i 10 kh�ch h�ng, 8 B?S l?n, 15 Inbox
??? server.ts           # Unified static server kh?i ch?y Vite middleware tr?c tuy?n
??? package.json        # ??nh chu?n kh?i ch?y v� dependencies phi�n b?n m?i nh?t
??? tsconfig.json       # Ph�n gi?i Typescript bundler
```

---

## ??? H??ng d?n c�i ??t & kh?i ch?y (Quickstart Guide)

### 1. Chu?n b? m�i tr??ng & c�i ??t Ollama
?? s? d?ng m� h�nh tr� tu? nh�n t?o ch?y c?c b? mi?n ph�, h�y t?i c�ng c? **Ollama**:
1. Truy c?p [Ollama Official Website](https://ollama.com/) v� t?i phi�n b?n ph� h?p cho h? ?i?u h�nh c?a b?n (Windows / macOS / Linux).
2. H�y c�i ??t v� m? terminal l�n ?? t?i m� h�nh m?c ??nh b?ng c�u l?nh:
   ```bash
   ollama pull qwen2.5
   # B?n c?ng c� th? d�ng llama3.1
   ollama pull llama3.1
   ```
3. Kh?i ??ng d?ch v? Ollama c?c b?:
   ```bash
   ollama serve
   ```
*M?c ??nh Ollama s? l?ng nghe t?i c?ng `http://localhost:11434`.*

---

### 2. Ch?y ?ng d?ng Web (Node.js Unified Client + Server)
?? ch?y demo nhanh ch�ng tr�n m�y t�nh c� nh�n c?a b?n, h�y s? d?ng c?ng Express + Vite th?ng nh?t ???c setup s?n:

**C�i ??t c�c g�i ph? thu?c:**
```bash
npm install
```

**Kh?i ch?y m�y ch? ph�t tri?n (Development):**
```bash
npm run dev
```
*Giao di?n c?a b?n s? xu?t hi?n lung linh t?i ??a ch? `http://localhost:3000`.*

**Bi�n d?ch b?n s?n xu?t (Production Build & Start):**
```bash
npm run build
npm run start
```
**C?u h�nh ch?y th?c t?:**
```bash
cp .env.example .env
# c?p nh?t GEMINI_API_KEY n?u d�ng Gemini, ho?c ch?n Ollama trong Settings
```

- Server Node/Express v� frontend Vite ???c ch?y chung qua `server.ts` ? m�i tr??ng development.
- Production build t?o `dist/server.cjs`; l?nh `npm run start` s? serve API v� frontend ?� build.
- Health check backend: `http://localhost:3000/api/health`.
- AI Assistant trong tab Chatbot AI g?i backend `/api/ai/chat`, d�ng Gemini qua `GEMINI_API_KEY` ho?c Ollama local qua Settings.

---

### 3. Ch?y Backend b?ng Python (FastAPI tham kh?o)
N?u b?n mong mu?n v?n h�nh ?ng d?ng qua m�y ch? **Python FastAPI** m?nh m? & b?o m?t:

1. Di chuy?n v�o th? m?c backend:
   ```bash
   cd backend
   ```
2. C�i ??t c�c th? vi?n c?n thi?t:
   ```bash
   pip install fastapi uvicorn httpx pydantic
   ```
3. Kh?i ch?y ?ng d?ng FastAPI:
   ```bash
   python app.py
   ```
M�y ch? Python FastAPI c?a b?n s? ho?t ??ng ho�n h?o t?i c?ng `http://localhost:8000`.

---

### 4. Ch?y Backend b?ng Ruby (Sinatra API tham kh?o)
N?u b?n mong mu?n v?n h�nh ?ng d?ng th�ng qua c?m m�y ch? **Ruby** chuy�n bi?t:

1. Di chuy?n v�o th? m?c backend:
   ```bash
   cd backend
   ```
2. C�i ??t c�c th? vi?n c?n thi?t:
   ```bash
   gem install sinatra json net-http
   ```
3. Ch?y ?ng d?ng Sinatra:
   ```bash
   ruby app.rb
   ```
M�y ch? backend Ruby c?a b?n s? t? ??ng kh?i ??ng t?i ??a ch? `http://localhost:4567`. B?n c� th? tinh ch?nh API fetch c?a frontend sang c?ng `4567` ho?c `8000` n�y trong m� ngu?n khi tri?n khai.

---

## ?? C�ch tr?i nghi?m & Test t�nh n?ng AI Agent

1. **C�ch chuy?n ch? ?? AI:** Chuy?n qua tab **C?u h�nh h? th?ng (Settings)** tr�n thanh ?i?u h??ng b�n tr�i. B?n c� th? ch?n gi?a **Gemini API** (m?c ??nh m??t m� ngo�i kh�u ??ng k�) ho?c **Ollama c?c b? c?a b?n** (truy xu?t nhanh qua endpoint ?� ch? ??nh).
2. **Ki?m th? AI Ph�n T�ch CRM:** ? tab **Kh�ch h�ng CRM**, h�y nh?n n�t **"Ph�n t�ch AI"** t?i m?t kh�ch h�ng b?t k?. AI Agent s? ??c d? li?u nhu c?u th?c t? c?a kh�ch, t�m g?n c�c b??c ti?p c?n th�ng th�i v� b? sung ?i?m ti?m n?ng cho chuy�n vi�n.
3. **Th? nghi?m AI T?o Tin T?c:** T?i tab **Gi? h�ng B?t ??ng s?n**, b?m ch?n **"Sinh Content Marketing"** tr�n m?t t?m card. B?n c� th? ?i?u ch?nh tone gi?ng v� th??ng th?c b�i vi?t k?ch b?n 4 k�nh kh�c bi?t c�ng Prompt sinh ?nh si�u th?c.
4. **H?i ?�p AI Chatbot:** ? m?c **Chatbot AI**, h�y g� c�c c�u l?nh b?ng ti?ng Vi?t nh?: *"Kh�ch n�o ?ang n�ng nh?t?"*, *"Vi?t b�i b�n l� ??t H�a Xu�n 4.6 t?"* ?? AI Agent l?c l?i database th?i gian th?c v� ?�m tho?i ??c l?c.

---

## Local Database (PostgreSQL)

App d?ng **PostgreSQL** qua Prisma (`DATABASE_URL` trong `.env`).

```bash
cp .env.example .env
npm run prisma:push
npm run dev
```

??ng b? DB production v? local ?? test:
```bash
npm run db:pull-and-sync
```

C?c nh?m d? li?u ch?nh: `cms_records`, `chat_history`, `generated_contents`, `leads`, `companies`, `users`, `settings`.

K?nh uu ti?n hi?n t?i:
- Facebook
- Zalo

C?c k?nh TikTok, Website, image/video prompt v?n du?c gi? ? m?c d? li?u d? ph?ng v? c? th? tri?n khai s?u hon sau.
