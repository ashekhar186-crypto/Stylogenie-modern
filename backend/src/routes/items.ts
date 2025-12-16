// backend/src/routes/items.ts
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma";           // your prisma helper (exports `prisma`)
import { requireAuth } from "../middleware/auth"; // must set req.auth.sub = userId

const router = Router();

// --- Zod schema matching your Prisma enums/fields ---
const sectionEnum = z.enum([
  "Tops",
  "Bottoms",
  "Dresses",
  "Outerwear",
  "Footwear",
  "Accessories",
  "Ethnicwear",
  "Sportswear",
]);

const seasonEnum = z.enum(["Spring", "Summer", "Autumn", "Winter"]);
const occasionEnum = z.enum(["Casual", "Formal", "Sports", "Party", "Ethnic"]);

const createItemSchema = z.object({
  imageUrl: z.string().url(),
  title: z.string().min(1).optional(),
  brand: z.string().min(1).optional(),
  section: sectionEnum.optional(),
  season: seasonEnum.optional(),
  occasion: occasionEnum.optional(),
});

const updateItemSchema = createItemSchema.partial();

// --- CREATE ---
router.post("/", requireAuth, async (req, res) => {
  const parsed = createItemSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid body" });
  }

  const data = parsed.data;

  try {
    const item = await prisma.item.create({
      data: {
        ownerId: req.auth!.sub, // set by requireAuth
        imageUrl: data.imageUrl,
        title: data.title ?? null,
        brand: data.brand ?? null,
        section: data.section ?? null,
        season: data.season ?? null,
        occasion: data.occasion ?? null,
        approved: false,
      },
    });
    res.status(201).json({ item });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to create item" });
  }
});

// --- LIST (owner=me) ---
router.get("/", requireAuth, async (req, res) => {
  try {
    const items = await prisma.item.findMany({
      where: { ownerId: req.auth!.sub, archived: false },
      orderBy: { createdAt: "desc" },
    });
    res.json({ items });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to list items" });
  }
});

// --- UPDATE ---
router.patch("/:id", requireAuth, async (req, res) => {
  const id = req.params.id;
  const parsed = updateItemSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid body" });
  }

  try {
    const updated = await prisma.item.update({
      where: { id },
      data: parsed.data,
    });
    res.json({ item: updated });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to update item" });
  }
});

// --- DELETE (soft) ---
router.delete("/:id", requireAuth, async (req, res) => {
  const id = req.params.id;
  try {
    await prisma.item.update({
      where: { id },
      data: { archived: true },
    });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to delete item" });
  }
});

export default router; // <-- IMPORTANT: default export
