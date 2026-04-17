// Lightweight in-memory rate limiter — no external dependencies
// Automatically evicts expired entries to prevent memory leaks

import { Request, Response, NextFunction } from "express";

type Entry = { count: number; resetAt: number };
const store = new Map<string, Entry>();

// Evict expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt < now) store.delete(key);
  }
}, 5 * 60 * 1000);

/**
 * Simple sliding-window rate limiter.
 * @param maxRequests  Max requests allowed per window
 * @param windowMs     Window length in milliseconds
 * @param keyFn        Function to derive a unique key from the request (default: IP)
 */
export function rateLimit(
  maxRequests: number,
  windowMs: number,
  keyFn: (req: Request) => string = (req) =>
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "unknown"
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.path}::${keyFn(req)}`;
    const now = Date.now();
    const entry = store.get(key);

    if (!entry || entry.resetAt < now) {
      // First request in window
      store.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    entry.count += 1;
    if (entry.count > maxRequests) {
      const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader("Retry-After", retryAfterSec);
      return res.status(429).json({
        error: `Too many requests. Please wait ${retryAfterSec} seconds and try again.`,
      });
    }

    return next();
  };
}
