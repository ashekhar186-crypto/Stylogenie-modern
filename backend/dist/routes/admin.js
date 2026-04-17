"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// backend/src/routes/admin.ts
// Admin-only routes: user management, item moderation, stats dashboard
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const prisma_1 = require("../db/prisma");
const router = (0, express_1.Router)();
// All admin routes require auth + ADMIN role
router.use(auth_1.requireAuth, (0, auth_1.requireRole)("ADMIN"));
/* ─── GET /admin/stats ─── */
router.get("/stats", async (_req, res) => {
    try {
        const [totalUsers, totalItems, pendingItems, archivedItems, itemsBySection, recentUsers,] = await Promise.all([
            prisma_1.prisma.user.count(),
            prisma_1.prisma.item.count({ where: { archived: false } }),
            prisma_1.prisma.item.count({ where: { approved: false, archived: false } }),
            prisma_1.prisma.item.count({ where: { archived: true } }),
            prisma_1.prisma.item.groupBy({
                by: ["section"],
                where: { archived: false },
                _count: { id: true },
            }),
            prisma_1.prisma.user.findMany({
                orderBy: { createdAt: "desc" },
                take: 5,
                select: { id: true, name: true, email: true, role: true, createdAt: true },
            }),
        ]);
        return res.json({
            stats: {
                totalUsers,
                totalItems,
                pendingItems,
                archivedItems,
                approvedItems: totalItems - pendingItems,
                itemsBySection: itemsBySection.map((g) => ({
                    section: g.section ?? "Unclassified",
                    count: g._count.id,
                })),
            },
            recentUsers,
        });
    }
    catch (e) {
        return res.status(500).json({ error: "Failed to fetch stats" });
    }
});
/* ─── GET /admin/users ─── */
router.get("/users", async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Number(req.query.limit) || 20);
    const skip = (page - 1) * limit;
    try {
        const [users, total] = await Promise.all([
            prisma_1.prisma.user.findMany({
                skip,
                take: limit,
                orderBy: { createdAt: "desc" },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                    createdAt: true,
                    _count: { select: { items: true } },
                },
            }),
            prisma_1.prisma.user.count(),
        ]);
        return res.json({
            users: users.map((u) => ({ ...u, itemCount: u._count.items })),
            total,
            page,
            pages: Math.ceil(total / limit),
        });
    }
    catch {
        return res.status(500).json({ error: "Failed to list users" });
    }
});
/* ─── GET /admin/items ─── */
router.get("/items", async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Number(req.query.limit) || 20);
    const skip = (page - 1) * limit;
    const filter = req.query.filter;
    const where = { archived: false };
    if (filter === "pending")
        where.approved = false;
    if (filter === "approved")
        where.approved = true;
    try {
        const [items, total] = await Promise.all([
            prisma_1.prisma.item.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: "desc" },
                include: {
                    owner: { select: { id: true, name: true, email: true } },
                },
            }),
            prisma_1.prisma.item.count({ where }),
        ]);
        return res.json({ items, total, page, pages: Math.ceil(total / limit) });
    }
    catch {
        return res.status(500).json({ error: "Failed to list items" });
    }
});
/* ─── PATCH /admin/items/:id/approve ─── */
router.patch("/items/:id/approve", async (req, res) => {
    try {
        const item = await prisma_1.prisma.item.update({
            where: { id: req.params.id },
            data: { approved: true },
        });
        return res.json({ item });
    }
    catch {
        return res.status(500).json({ error: "Failed to approve item" });
    }
});
/* ─── DELETE /admin/items/:id ─── */
router.delete("/items/:id", async (req, res) => {
    try {
        await prisma_1.prisma.item.update({
            where: { id: req.params.id },
            data: { archived: true },
        });
        return res.json({ ok: true });
    }
    catch {
        return res.status(500).json({ error: "Failed to archive item" });
    }
});
/* ─── PATCH /admin/users/:id/role ─── */
router.patch("/users/:id/role", async (req, res) => {
    const { role } = req.body;
    if (!["ADMIN", "MEMBER"].includes(role))
        return res.status(400).json({ error: "Invalid role" });
    try {
        const user = await prisma_1.prisma.user.update({
            where: { id: req.params.id },
            data: { role },
            select: { id: true, name: true, email: true, role: true },
        });
        return res.json({ user });
    }
    catch {
        return res.status(500).json({ error: "Failed to update role" });
    }
});
exports.default = router;
