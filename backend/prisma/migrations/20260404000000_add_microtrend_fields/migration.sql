-- Migration: add_microtrend_fields
-- Adds 2025 micro-trend intelligence columns to the Item table.
-- These are populated by the CLIP fashion classifier (classifier_service.py)
-- when a new wardrobe item is classified.

ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "microTrend" TEXT;
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "trendiness" DOUBLE PRECISION;
