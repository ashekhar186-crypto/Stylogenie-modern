import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export type Role = "ADMIN" | "MEMBER";
export type AuthUser = { sub: string; role: Role };

declare global {
  namespace Express {
    interface Request { auth?: AuthUser }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.access_token as string | undefined;
  if (!token) return res.status(401).json({ error: "Unauthenticated" });

  try {
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as AuthUser & jwt.JwtPayload;
    req.auth = { sub: payload.sub, role: payload.role };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid/expired token" });
  }
}

export function requireRole(role: "ADMIN") {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) return res.status(401).json({ error: "Unauthenticated" });
    if (req.auth.role !== role) return res.status(403).json({ error: "Forbidden" });
    next();
  };
}
