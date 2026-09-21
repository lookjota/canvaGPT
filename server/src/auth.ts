import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { db } from './db.js';
import { env } from './env.js';

declare global { namespace Express { interface Request { userId?: string } } }

export const hashPassword = (password: string) => bcrypt.hash(password, 12);
export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);
const token = (userId: string) => jwt.sign({ userId }, env.JWT_SECRET, { expiresIn: '7d' });

export function setSession(res: Response, userId: string) {
  res.cookie('orion_session', token(userId), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 7 * 86400000 });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const raw = req.cookies?.orion_session;
  if (!raw) return res.status(401).json({ error: 'UNAUTHORIZED' });
  try { req.userId = (jwt.verify(raw, env.JWT_SECRET) as { userId: string }).userId; next(); }
  catch { return res.status(401).json({ error: 'UNAUTHORIZED' }); }
}

export async function requireProjectMember(projectId: string, userId: string, write = false) {
  const member = await db.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } } });
  if (!member || (write && member.role === 'viewer')) return null;
  return member;
}
