# PostgreSQL Setup Guide

## 1. Cài đặt PostgreSQL

### Windows
- Download từ: https://www.postgresql.org/download/windows/
- Cài đặt với default port `5432`
- Ghi nhớ password cho user `postgres`

### macOS (sử dụng Homebrew)
```bash
brew install postgresql@15
brew services start postgresql@15
```

### Linux (Ubuntu/Debian)
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
```

---

## 2. Tạo Database

```bash
# Login vào PostgreSQL
psql -U postgres

# Tạo database
CREATE DATABASE real_estate_ai;

# Tạo user (optional)
CREATE USER cms_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE real_estate_ai TO cms_user;

# Thoát
\q
```

---

## 3. Cấu hình .env

Tạo file `.env` trong thư mục root:

```env
# Database
DATABASE_URL="postgresql://postgres:your_password@localhost:5432/real_estate_ai?schema=public"

# Hoặc nếu dùng user khác:
# DATABASE_URL="postgresql://cms_user:your_secure_password@localhost:5432/real_estate_ai?schema=public"

# AI
GEMINI_API_KEY="your-api-key"
DEFAULT_AI_MODE="gemini"

# Server
PORT=3000
NODE_ENV="development"
```

---

## 4. Chạy Prisma Migrations

```bash
# Generate Prisma Client
npx prisma generate

# Chạy migrations (tạo tables)
npx prisma migrate dev --name init

# Hoặc nếu muốn push schema mà không tạo migration file:
npx prisma db push
```

---

## 5. Seed Database (Optional)

Tạo file `prisma/seed.ts` để populate dữ liệu mẫu:

```typescript
import { prisma } from '../server/prisma';

async function main() {
  // Tạo settings
  await prisma.appSettings.upsert({
    where: { id: 'default' },
    update: {},
    create: {
      id: 'default',
      ai_mode: 'gemini',
      ollama_endpoint: 'http://localhost:11434',
      ollama_model: 'qwen2.5',
      agent_tone: 'chuyên nghiệp'
    }
  });

  // Tạo automation mẫu
  await prisma.automationTask.createMany({
    data: [
      {
        name: 'Tự động tạo post khi thêm BĐS',
        trigger_event: 'Khi thêm mới bất động sản',
        action_description: 'Tạo 3 bài draft cho Facebook, Zalo, TikTok',
        status: 'active'
      }
    ],
    skipDuplicates: true
  });
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));
```

Rồi chạy:
```bash
npx prisma db seed
```

---

## 6. Kiểm tra Database

```bash
# Mở Prisma Studio (GUI để quản lý data)
npx prisma studio
```

Truy cập http://localhost:5555 để xem/chỉnh sửa dữ liệu

---

## 7. Chạy Application

```bash
npm run dev
```

Server sẽ chạy tại http://localhost:3000

---

## Troubleshooting

### "connect ECONNREFUSED"
- Kiểm tra PostgreSQL đã chạy chưa: `pg_isready -h localhost -p 5432`
- Kiểm tra DATABASE_URL đúng chưa

### "Authentication failed"
- Kiểm tra password trong DATABASE_URL
- Tạo lại user: `ALTER USER postgres WITH PASSWORD 'new_password';`

### Migrations fail
```bash
# Reset database (mất dữ liệu!)
npx prisma migrate reset

# Hoặc xem chi tiết lỗi
npx prisma migrate dev --name fix
```

---

## Backup & Restore

```bash
# Backup
pg_dump -U postgres real_estate_ai > backup.sql

# Restore
psql -U postgres real_estate_ai < backup.sql
```
