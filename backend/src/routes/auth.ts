import { Router } from "express";
import { z } from "zod";
import argon2 from "argon2";
import { prisma } from "../db/prisma";
import { cookieOpts, signAccess, signRefresh, verifyRefresh } from "../utils/jwt";
import { requireAuth } from "../middleware/auth";

const router = Router();

const registerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
});

router.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

  const { name, email, password } = parsed.data;
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return res.status(409).json({ error: "Email already registered" });

  const passwordHash = await argon2.hash(password);
  const user = await prisma.user.create({
    data: { name, email, passwordHash, role: "MEMBER" },
  });

  const payload = { sub: user.id, role: user.role };
  const access = signAccess(payload);
  const refresh = signRefresh(payload);

  res
    .cookie("access_token", access, { ...cookieOpts })
    .cookie("refresh_token", refresh, { ...cookieOpts, path: "/api/v1/auth/refresh" })
    .status(201)
    .json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const ok = await argon2.verify(user.passwordHash, password);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  const payload = { sub: user.id, role: user.role };
  const access = signAccess(payload);
  const refresh = signRefresh(payload);

  res
    .cookie("access_token", access, { ...cookieOpts })
    .cookie("refresh_token", refresh, { ...cookieOpts, path: "/api/v1/auth/refresh" })
    .json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

router.post("/refresh", async (req, res) => {
  const token = req.cookies?.refresh_token as string | undefined;
  if (!token) return res.status(401).json({ error: "No refresh token" });
  try {
    const payload = verifyRefresh(token);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) return res.status(401).json({ error: "User not found" });

    const access = signAccess({ sub: user.id, role: user.role });
    const refresh = signRefresh({ sub: user.id, role: user.role });

    res
      .cookie("access_token", access, { ...cookieOpts })
      .cookie("refresh_token", refresh, { ...cookieOpts, path: "/api/v1/auth/refresh" })
      .json({ ok: true });
  } catch {
    res.status(401).json({ error: "Invalid refresh token" });
  }
});

router.post("/logout", (_req, res) => {
  res
    .clearCookie("access_token", { ...cookieOpts })
    .clearCookie("refresh_token", { ...cookieOpts, path: "/api/v1/auth/refresh" })
    .json({ ok: true });
});

// GET /me — return current authenticated user
router.get("/me", requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.auth!.sub },
      select: { id: true, name: true, email: true, role: true },
    });
    if (!user) return res.status(404).json({ error: "User not found" });
    return res.json({ user });
  } catch {
    return res.status(500).json({ error: "Failed to fetch user" });
  }
});

export default router;
