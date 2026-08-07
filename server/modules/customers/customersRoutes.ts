import { Router, type Request, type Response } from 'express';
import { readDatabase, writeDatabase } from '../../dbHelper';
import { analyzeCustomerWithAI } from '../../aiService';
import type { Customer } from '../../../src/types';
import { parseListQuery, paginateItems, matchesSearchText } from '../../listPagination';
import {
  accessDefaults,
  canAccessResource,
  canManageResource,
  scopeCollection,
} from '../auth/authAccess';
import { triggerAutomationEvent } from '../content/triggerAutomationEvent';

export function createCustomersRouter() {
  const router = Router();

router.get('/api/customers', (req: Request, res: Response) => {
  const db = readDatabase();
  let items = scopeCollection(db.customers, req);
  const { hasPage, page, limit, search, status, sort } = parseListQuery(req.query as Record<string, unknown>);

  if (search) {
    items = items.filter(c =>
      matchesSearchText(
        [c.name, c.phone, c.email, c.interested_area, c.property_type, c.notes, c.ai_summary].join(' '),
        search,
      ),
    );
  }
  if (status) {
    items = items.filter(c => String(c.status || '') === status);
  }
  if (sort === 'score_desc') {
    items = items.slice().sort((a, b) => Number(b.lead_score || 0) - Number(a.lead_score || 0));
  } else if (sort === 'created_at_asc') {
    items = items.slice().sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
  } else if (sort === 'created_at_desc' || sort) {
    items = items.slice().sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  }

  if (!hasPage) {
    res.json({ status: 'success', data: items });
    return;
  }
  res.json({ status: 'success', data: paginateItems(items, page, limit) });
});

router.post('/api/customers', async (req: Request, res: Response) => {
  const db = readDatabase();
  const customerData = req.body;
  
  const newCustomer: Customer = {
    id: `c-${Date.now()}`,
    name: customerData.name || 'Khách hàng mới',
    phone: customerData.phone || '',
    email: customerData.email || '',
    source: customerData.source || 'website',
    budget: parseFloat(customerData.budget) || 0,
    interested_area: customerData.interested_area || 'Đà Nẵng',
    property_type: customerData.property_type || 'Đất nền',
    status: customerData.status || 'new',
    notes: customerData.notes || '',
    ai_summary: customerData.ai_summary || 'Chưa phân tích',
    lead_score: parseInt(customerData.lead_score) || 50,
    created_at: new Date().toISOString(),
    ...accessDefaults(req, customerData)
  };

  db.customers.push(newCustomer);
  
  // Lead score automation trigger
  if (newCustomer.lead_score > 80) {
    triggerAutomationEvent('Lead Score vượt mốc 80', `Khách hàng tiềm năng: ${newCustomer.name}`, db);
  }

  await writeDatabase(db);
  res.json({ status: 'success', data: newCustomer });
});

router.put('/api/customers/:id', async (req: Request, res: Response) => {
  const db = readDatabase();
  const index = db.customers.findIndex(c => c.id === req.params.id);
  
  if (index === -1) {
    res.status(404).json({ status: 'error', message: 'Không tìm thấy khách hàng' });
    return;
  }

  if (!canManageResource(db.customers[index], req)) {
    res.status(403).json({ status: 'error', message: 'Bạn không có quyền cập nhật khách hàng này.' });
    return;
  }

  const oldCustomer = db.customers[index];
  const updatedCustomer = {
    ...oldCustomer,
    ...req.body,
    updated_at: new Date().toISOString()
  };

  db.customers[index] = updatedCustomer;

  // Check if score changed above 80
  if (updatedCustomer.lead_score > 80 && oldCustomer.lead_score <= 80) {
    triggerAutomationEvent('Lead Score vượt mốc 80', `Cập nhật khách hàng VIP: ${updatedCustomer.name}`, db);
  }

  await writeDatabase(db);
  res.json({ status: 'success', data: updatedCustomer });
});

router.delete('/api/customers/:id', async (req: Request, res: Response) => {
  const db = readDatabase();
  const target = db.customers.find(c => c.id === req.params.id);
  const filtered = db.customers.filter(c => c.id !== req.params.id);
  
  if (filtered.length === db.customers.length) {
    res.status(404).json({ status: 'error', message: 'Không tìm thấy khách hàng' });
    return;
  }

  if (!canManageResource(target, req)) {
    res.status(403).json({ status: 'error', message: 'Bạn không có quyền xóa khách hàng này.' });
    return;
  }

  db.customers = filtered;
  await writeDatabase(db);
  res.json({ status: 'success', message: 'Đã xóa khách hàng thành công' });
});

// POST /api/ai/analyze-customer
router.post('/api/ai/analyze-customer', async (req: Request, res: Response) => {
  const { customerId } = req.body;
  const db = readDatabase();
  const customer = db.customers.find(c => c.id === customerId);

  if (!customer) {
    res.status(404).json({ status: 'error', message: 'Không tìm thấy khách hàng để phân tích.' });
    return;
  }

  if (!canAccessResource(customer, req)) {
    res.status(403).json({ status: 'error', message: 'Bạn không có quyền phân tích khách hàng này.' });
    return;
  }

  try {
    const analysis = await analyzeCustomerWithAI(customer);
    customer.ai_summary = analysis.ai_summary;
    customer.lead_score = analysis.lead_score;
    
    // Check if score changed above 80
    if (customer.lead_score > 80) {
      triggerAutomationEvent('Lead Score vượt mốc 80', `AI chấm điểm VIP: ${customer.name}`, db);
    }

    await writeDatabase(db);
    res.json({ status: 'success', data: customer });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

  return router;
}
