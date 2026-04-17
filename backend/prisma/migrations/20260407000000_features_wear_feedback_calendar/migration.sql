-- Migration: Features 1, 5, 6, 7, 14
-- Adds wear tracking, laundry status, OutfitFeedback model, OutfitCalendar model,
-- and packing checklist support to TripPlan.

-- Feature 6 & 7: Wear tracking + laundry on Item
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "inLaundry" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "wearCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "lastWorn" TIMESTAMP(3);

-- Feature 14: Packing checklist on TripPlan
ALTER TABLE "TripPlan" ADD COLUMN IF NOT EXISTS "checkedItems" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Feature 1: OutfitFeedback
CREATE TABLE IF NOT EXISTS "OutfitFeedback" (
    "id"          TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "outfitHash"  TEXT NOT NULL,
    "reaction"    TEXT NOT NULL,
    "outfitType"  TEXT,
    "occasion"    TEXT,
    "itemIds"     TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes"       TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutfitFeedback_pkey" PRIMARY KEY ("id")
);

-- Unique constraint: one reaction per user per outfit combination
CREATE UNIQUE INDEX IF NOT EXISTS "OutfitFeedback_userId_outfitHash_key" ON "OutfitFeedback"("userId", "outfitHash");

-- Index for fast user lookups
CREATE INDEX IF NOT EXISTS "OutfitFeedback_userId_reaction_idx" ON "OutfitFeedback"("userId", "reaction");

-- Foreign key
ALTER TABLE "OutfitFeedback" DROP CONSTRAINT IF EXISTS "OutfitFeedback_userId_fkey";
ALTER TABLE "OutfitFeedback" ADD CONSTRAINT "OutfitFeedback_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Feature 5: OutfitCalendar
CREATE TABLE IF NOT EXISTS "OutfitCalendar" (
    "id"           TEXT NOT NULL,
    "userId"       TEXT NOT NULL,
    "date"         TEXT NOT NULL,
    "outfitLabel"  TEXT,
    "itemIds"      TEXT[] DEFAULT ARRAY[]::TEXT[],
    "outfitType"   TEXT,
    "occasion"     TEXT,
    "notes"        TEXT,
    "imageUrl"     TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutfitCalendar_pkey" PRIMARY KEY ("id")
);

-- Unique constraint: one outfit entry per user per date
CREATE UNIQUE INDEX IF NOT EXISTS "OutfitCalendar_userId_date_key" ON "OutfitCalendar"("userId", "date");

-- Index for month-range queries
CREATE INDEX IF NOT EXISTS "OutfitCalendar_userId_date_idx" ON "OutfitCalendar"("userId", "date");

-- Foreign key
ALTER TABLE "OutfitCalendar" DROP CONSTRAINT IF EXISTS "OutfitCalendar_userId_fkey";
ALTER TABLE "OutfitCalendar" ADD CONSTRAINT "OutfitCalendar_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
