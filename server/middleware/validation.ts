import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';

// Format Zod issues consistently: { status: 'error', message, issues }
export function validateSchema(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const issues = result.error.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
      }));
      res.status(400).json({
        status: 'error',
        message: issues[0]?.message || 'Dữ liệu không hợp lệ.',
        issues,
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

// 1. Login schema
export const loginSchema = z.object({
  email: z.string().trim().email('Email không đúng định dạng.'),
  password: z.string().min(1, 'Mật khẩu không được để trống.'),
});

// 2. User Create schema
export const createUserSchema = z.object({
  name: z.string().trim().min(2, 'Tên người dùng phải có ít nhất 2 ký tự.'),
  email: z.string().trim().email('Email không đúng định dạng.'),
  password: z.string().min(10, 'Mật khẩu phải có ít nhất 10 ký tự.'),
  role: z.enum(['owner', 'company', 'member']).optional().default('member'),
  company_id: z.string().optional(),
  status: z.enum(['active', 'inactive']).optional().default('active'),
});

// 3. User Update schema
export const updateUserSchema = z.object({
  name: z.string().trim().min(2).optional(),
  email: z.string().trim().email().optional(),
  password: z.string().min(10).optional(),
  role: z.enum(['owner', 'company', 'member']).optional(),
  company_id: z.string().optional(),
  status: z.enum(['active', 'inactive']).optional(),
  agent_tier: z.enum(['legendary', 'diamond', 'gold', 'silver', 'bronze', 'normal']).optional(),
});

// 4. Update Profile schema
export const updateProfileSchema = z.object({
  name: z.string().trim().min(2).optional(),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().optional(),
  bio: z.string().optional(),
  public_slug: z.string().trim().optional(),
  show_public_profile: z.boolean().optional(),
  current_password: z.string().optional(),
  new_password: z.string().min(10).optional(),
  image: z.string().optional(),
});

// 5. Public Contact/Lead schema
export const publicContactSchema = z.object({
  name: z.string().trim().min(2, 'Vui lòng nhập họ và tên.'),
  phone: z.string().trim().min(8, 'Số điện thoại không hợp lệ.'),
  email: z.string().trim().email('Email không hợp lệ.').optional(),
  message: z.string().optional(),
  property_id: z.string().optional(),
});

// 6. Public Chat Guest schema
export const publicChatGuestSchema = z.object({
  session_id: z.string().min(1, 'Session ID là bắt buộc.'),
  message: z.string().trim().min(1, 'Nội dung tin nhắn không được để trống.'),
  name: z.string().trim().optional(),
  phone: z.string().trim().optional(),
});
