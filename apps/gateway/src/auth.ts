import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { query } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-change-me-cs-billing';

export type AuthUser = {
  id: string;
  tenantId: string | null;
  username: string;
  role: 'platform_admin' | 'tenant_admin' | 'operator';
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(user: AuthUser): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });
}

export function authRequired(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, message: '请先登录' });
    return;
  }
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET) as AuthUser;
    next();
  } catch {
    res.status(401).json({ success: false, message: '登录已失效，请重新登录' });
  }
}

export function requireRole(...roles: AuthUser['role'][]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ success: false, message: '权限不足' });
      return;
    }
    next();
  };
}

/** 停用商户不可再用 /tenant 与智能回复相关能力（/me 除外） */
export async function requireActiveTenant(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const user = req.user;
  if (!user?.tenantId) {
    next();
    return;
  }
  try {
    const t = await query<{ status: string }>(
      'SELECT status FROM tenants WHERE id = $1',
      [user.tenantId],
    );
    if (t.rows[0]?.status !== 'active') {
      res.status(403).json({ success: false, message: '商户已停用' });
      return;
    }
    next();
  } catch (e) {
    next(e);
  }
}

export async function login(username: string, password: string) {
  const result = await query<{
    id: string;
    tenant_id: string | null;
    username: string;
    password_hash: string;
    role: AuthUser['role'];
    tenant_status: string | null;
  }>(
    `SELECT o.id, o.tenant_id, o.username, o.password_hash, o.role, t.status AS tenant_status
     FROM operators o
     LEFT JOIN tenants t ON t.id = o.tenant_id
     WHERE o.username = $1`,
    [username],
  );
  const row = result.rows[0];
  if (!row) return null;
  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) return null;
  if (row.role !== 'platform_admin' && row.tenant_status === 'suspended') {
    throw new Error('TENANT_SUSPENDED');
  }
  const user: AuthUser = {
    id: row.id,
    tenantId: row.tenant_id,
    username: row.username,
    role: row.role,
  };
  return { user, token: signToken(user) };
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}
