"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const argon2_1 = __importDefault(require("argon2"));
const prisma_1 = require("../db/prisma");
const jwt_1 = require("../utils/jwt");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const registerSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(6),
});
router.post("/register", async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: "Invalid input" });
    const { name, email, password } = parsed.data;
    const exists = await prisma_1.prisma.user.findUnique({ where: { email } });
    if (exists)
        return res.status(409).json({ error: "Email already registered" });
    const passwordHash = await argon2_1.default.hash(password);
    const user = await prisma_1.prisma.user.create({
        data: { name, email, passwordHash, role: "MEMBER" },
    });
    const payload = { sub: user.id, role: user.role };
    const access = (0, jwt_1.signAccess)(payload);
    const refresh = (0, jwt_1.signRefresh)(payload);
    res
        .cookie("access_token", access, { ...jwt_1.cookieOpts })
        .cookie("refresh_token", refresh, { ...jwt_1.cookieOpts, path: "/api/v1/auth/refresh" })
        .status(201)
        .json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(6),
});
router.post("/login", async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: "Invalid input" });
    const { email, password } = parsed.data;
    const user = await prisma_1.prisma.user.findUnique({ where: { email } });
    if (!user)
        return res.status(401).json({ error: "Invalid credentials" });
    const ok = await argon2_1.default.verify(user.passwordHash, password);
    if (!ok)
        return res.status(401).json({ error: "Invalid credentials" });
    const payload = { sub: user.id, role: user.role };
    const access = (0, jwt_1.signAccess)(payload);
    const refresh = (0, jwt_1.signRefresh)(payload);
    res
        .cookie("access_token", access, { ...jwt_1.cookieOpts })
        .cookie("refresh_token", refresh, { ...jwt_1.cookieOpts, path: "/api/v1/auth/refresh" })
        .json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});
router.post("/refresh", async (req, res) => {
    const token = req.cookies?.refresh_token;
    if (!token)
        return res.status(401).json({ error: "No refresh token" });
    try {
        const payload = (0, jwt_1.verifyRefresh)(token);
        const user = await prisma_1.prisma.user.findUnique({ where: { id: payload.sub } });
        if (!user)
            return res.status(401).json({ error: "User not found" });
        const access = (0, jwt_1.signAccess)({ sub: user.id, role: user.role });
        const refresh = (0, jwt_1.signRefresh)({ sub: user.id, role: user.role });
        res
            .cookie("access_token", access, { ...jwt_1.cookieOpts })
            .cookie("refresh_token", refresh, { ...jwt_1.cookieOpts, path: "/api/v1/auth/refresh" })
            .json({ ok: true });
    }
    catch {
        res.status(401).json({ error: "Invalid refresh token" });
    }
});
router.post("/logout", (_req, res) => {
    res
        .clearCookie("access_token", { ...jwt_1.cookieOpts })
        .clearCookie("refresh_token", { ...jwt_1.cookieOpts, path: "/api/v1/auth/refresh" })
        .json({ ok: true });
});
// GET /me — return current authenticated user
router.get("/me", auth_1.requireAuth, async (req, res) => {
    try {
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: req.auth.sub },
            select: { id: true, name: true, email: true, role: true },
        });
        if (!user)
            return res.status(404).json({ error: "User not found" });
        return res.json({ user });
    }
    catch {
        return res.status(500).json({ error: "Failed to fetch user" });
    }
});
exports.default = router;
