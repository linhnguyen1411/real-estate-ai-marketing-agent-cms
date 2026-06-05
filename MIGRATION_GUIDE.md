# Migration Guide: server.ts → Prisma

## Tổng quan thay đổi

Thay đổi từ file-based database (`readDatabase`/`writeDatabase`) sang Prisma async queries.

---

## Quy tắc chuyển đổi

### Trước (File-based)
```typescript
app.get('/api/customers', (req: Request, res: Response) => {
  const db = readDatabase();
  res.json({ status: 'success', data: db.customers });
});
```

### Sau (Prisma)
```typescript
app.get('/api/customers', async (req: Request, res: Response) => {
  try {
    const customers = await getCustomers();
    res.json({ status: 'success', data: customers });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});
```

---

## Danh sách thay đổi chính

### 1. GET Endpoints (Read)

```typescript
// Trước
app.get('/api/customers', (req: Request, res: Response) => {
  const db = readDatabase();
  res.json({ status: 'success', data: db.customers });
});

// Sau
app.get('/api/customers', async (req: Request, res: Response) => {
  try {
    const customers = await getCustomers();
    res.json({ status: 'success', data: customers });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});
```

### 2. POST Endpoints (Create)

```typescript
// Trước
app.post('/api/customers', (req: Request, res: Response) => {
  const db = readDatabase();
  const newCustomer = { id: `c-${Date.now()}`, ...req.body };
  db.customers.push(newCustomer);
  writeDatabase(db);
  res.json({ status: 'success', data: newCustomer });
});

// Sau
app.post('/api/customers', async (req: Request, res: Response) => {
  try {
    const newCustomer = await createCustomer({
      ...req.body,
      budget: parseFloat(req.body.budget),
      lead_score: parseInt(req.body.lead_score) || 50
    });
    res.json({ status: 'success', data: newCustomer });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});
```

### 3. PUT Endpoints (Update)

```typescript
// Trước
app.put('/api/customers/:id', (req: Request, res: Response) => {
  const db = readDatabase();
  const index = db.customers.findIndex(c => c.id === req.params.id);
  if (index === -1) {
    res.status(404).json({ status: 'error', message: 'Not found' });
    return;
  }
  db.customers[index] = { ...db.customers[index], ...req.body };
  writeDatabase(db);
  res.json({ status: 'success', data: db.customers[index] });
});

// Sau
app.put('/api/customers/:id', async (req: Request, res: Response) => {
  try {
    const updated = await updateCustomer(req.params.id, req.body);
    res.json({ status: 'success', data: updated });
  } catch (err: any) {
    res.status(404).json({ status: 'error', message: err.message });
  }
});
```

### 4. DELETE Endpoints

```typescript
// Trước
app.delete('/api/customers/:id', (req: Request, res: Response) => {
  const db = readDatabase();
  db.customers = db.customers.filter(c => c.id !== req.params.id);
  writeDatabase(db);
  res.json({ status: 'success', message: 'Deleted' });
});

// Sau
app.delete('/api/customers/:id', async (req: Request, res: Response) => {
  try {
    await deleteCustomer(req.params.id);
    res.json({ status: 'success', message: 'Deleted successfully' });
  } catch (err: any) {
    res.status(404).json({ status: 'error', message: err.message });
  }
});
```

### 5. Complex queries (Automation trigger)

```typescript
// Trước
function triggerAutomationEvent(event: string, detail: string, db: any) {
  const now = new Date().toISOString();
  db.automations = db.automations.map((auto: AutomationTask) => {
    if (auto.status === 'active' && auto.trigger_event.includes(event)) {
      return { ...auto, last_run: now, run_count: auto.run_count + 1 };
    }
    return auto;
  });
}

// Sau
await triggerAutomationEvent(event, detail);
// Hàm đã được implement trong dbHelper.ts
```

### 6. AI Service context query

```typescript
// Trước
app.post('/api/ai/chat', async (req: Request, res: Response) => {
  const db = readDatabase();
  const aiResponse = await generateAILiveChatReply(req.body.message, {
    customers: db.customers,
    properties: db.properties,
    posts: db.posts
  });
});

// Sau
app.post('/api/ai/chat', async (req: Request, res: Response) => {
  try {
    const context = await getAllDataForContext();
    const aiResponse = await generateAILiveChatReply(req.body.message, {
      customers: context.customers,
      properties: context.properties,
      posts: context.posts
    });
    res.json({ status: 'success', data: aiResponse });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});
```

---

## Chú ý quan trọng

1. **Tất cả endpoints phải là async**: Thêm `async` trước callback function
2. **Try-catch cho tất cả DB operations**: Wrap trong try-catch để handle errors
3. **Không gọi writeDatabase()**: Prisma tự lưu, không cần gọi save thêm
4. **Relations**: Nếu cần data từ properties khi lấy posts, dùng `include`:
   ```typescript
   const posts = await prisma.post.findMany({
     include: { property: true }
   });
   ```

---

## Steps để hoàn tất migration

1. Chuẩn bị PostgreSQL (xem POSTGRES_SETUP.md)
2. Chạy `npx prisma migrate dev --name init`
3. Update từng endpoint trong server.ts theo pattern trên
4. Update aiService.ts để dùng async getAppSettings()
5. Test từng API endpoint
6. Chạy `npm run build` để kiểm tra TypeScript compilation

---

## Testing

```bash
# Sau khi update server.ts, test:
npm run dev

# Test API
curl -X GET http://localhost:3000/api/customers

# Xem Prisma Studio
npx prisma studio
```
