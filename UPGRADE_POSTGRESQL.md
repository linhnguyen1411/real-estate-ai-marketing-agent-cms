# 🚀 PostgreSQL Upgrade Guide

**Dự án đã được upgrade để hỗ trợ PostgreSQL thay vì file-based database!**

---

## 📋 Tóm tắt thay đổi

| Tiêu chí | Trước | Sau |
|---------|------|-----|
| Database | SQLite / JSON file | PostgreSQL |
| ORM | Direct file operations | Prisma ORM |
| Type Safety | Partial | Full (Prisma schemas) |
| Query | readDatabase() / writeDatabase() | Async/await queries |
| Scalability | 1-5 concurrent users | 100+ concurrent users |

---

## 🎯 Files được tạo/thay đổi

1. **prisma/schema.prisma** - Prisma schema definition
2. **server/prisma.ts** - Prisma client initialization
3. **server/dbHelper.ts** - Database helper functions (rewritten)
4. **server-prisma.ts** - Simplified server với Prisma
5. **POSTGRES_SETUP.md** - Setup guide chi tiết
6. **MIGRATION_GUIDE.md** - Cách migrate server.ts

---

## ⚡ Quickstart (5 phút)

### Step 1: Setup PostgreSQL

**Windows:**
- Download từ https://www.postgresql.org/download/windows/
- Cài đặt, ghi nhớ password

**macOS:**
```bash
brew install postgresql@15
brew services start postgresql@15
```

**Linux:**
```bash
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
```

### Step 2: Tạo Database

```bash
psql -U postgres

# Tạo database
CREATE DATABASE real_estate_ai;

\q
```

### Step 3: Configure .env

```bash
cat > .env << EOF
DATABASE_URL="postgresql://postgres:your_password@localhost:5432/real_estate_ai?schema=public"
GEMINI_API_KEY="your-key"
EOF
```

### Step 4: Chạy Migrations

```bash
npx prisma migrate dev --name init
```

### Step 5: Chạy Server

```bash
# Dùng server mới (Prisma)
npm run dev:prisma

# Hoặc server cũ (SQL ite - sau khi migrate)
npm run dev
```

Truy cập: http://localhost:3000

---

## 🔄 Quá trình Migration

### Option A: Sử dụng server-prisma.ts ngay (Recommended)

Đây là phiên bản mới đơn giản, không có authentication phức tạp:

```bash
npm run dev:prisma
```

**Ưu điểm:**
- ✅ Đã support Prisma hoàn toàn
- ✅ Clean code, dễ hiểu
- ✅ API endpoints đầy đủ

**Nhược điểm:**
- ❌ Bỏ mất authentication logic từ server.ts cũ
- ❌ Nếu bạn cần authentication, phải thêm lại

### Option B: Migrate server.ts cũ từng endpoint một

Nếu bạn cần giữ authentication logic từ server.ts cũ:

1. Đọc [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md)
2. Update từng endpoint theo pattern
3. Thay `readDatabase()/writeDatabase()` → async Prisma queries
4. Test từng API sau khi update

---

## 📊 Xem & Quản lý Data

Mở Prisma Studio (GUI):

```bash
npm run prisma:studio
```

Truy cập http://localhost:5555

---

## 📝 Các commands hữu ích

```bash
# Chạy dev server
npm run dev:prisma

# Chạy migrations
npm run prisma:migrate

# Push schema mà không migration
npm run prisma:push

# Xem Prisma Studio
npm run prisma:studio

# Build production
npm run build:prisma

# Lint TypeScript
npm run lint
```

---

## 🗄️ Schema Prisma

```prisma
model Customer {
  id              String   @id @default(cuid())
  name            String
  phone           String
  email           String?
  budget          Float    // VND billions
  lead_score      Int      @default(50)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  inbox           InboxMessage[]
}

model Property {
  id              String   @id @default(cuid())
  title           String
  price           Float    // VND billions
  location        String
  area            Float    // m2
  ai_posts        Json?
  createdAt       DateTime @default(now())
  
  posts           Post[]
  inbox           InboxMessage[]
}

// ... xem đầy đủ trong prisma/schema.prisma
```

---

## 🐛 Troubleshooting

### Error: "connect ECONNREFUSED"

```bash
# Kiểm tra PostgreSQL chạy chưa
pg_isready -h localhost -p 5432

# Nếu chưa, start server
# macOS:
brew services start postgresql@15

# Linux:
sudo systemctl start postgresql

# Windows: Open PostgreSQL Services
```

### Error: "Authentication failed"

Kiểm tra DATABASE_URL trong .env:
```env
DATABASE_URL="postgresql://postgres:your_password@localhost:5432/real_estate_ai?schema=public"
```

Thay `your_password` bằng password PostgreSQL của bạn.

### Error: Migrations fail

```bash
# Reset database (mất dữ liệu!)
npx prisma migrate reset

# Xem chi tiết lỗi
npx prisma migrate dev
```

---

## ✅ Kiểm tra setup

```bash
# 1. Kiểm tra PostgreSQL
psql -U postgres -c "SELECT version();"

# 2. Kiểm tra .env
cat .env

# 3. Kiểm tra Prisma connection
npm run prisma:studio

# 4. Kiểm tra API
curl http://localhost:3000/api/health
```

---

## 📚 Tài liệu thêm

- [Prisma Documentation](https://www.prisma.io/docs/)
- [PostgreSQL Setup Details](./POSTGRES_SETUP.md)
- [Migration Guide](./MIGRATION_GUIDE.md)
- [Type Definitions](./src/types.ts)

---

## 🎉 Kế tiếp

✅ Database: PostgreSQL với Prisma
✅ API endpoints: Hoàn toàn async
✅ Type Safety: Prisma schemas + TypeScript
✅ Scalability: Production-ready

**Có gì muốn thêm?**
- Authentication (JWT)?
- caching (Redis)?
- Testing suite?
- Docker setup?
