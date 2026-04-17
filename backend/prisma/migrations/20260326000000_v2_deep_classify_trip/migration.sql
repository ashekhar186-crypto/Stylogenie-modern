-- StyloGenie v2: Deep Classification fields + TripPlan model

-- Add deep classification fields to Item
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "texture" TEXT;
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "pattern" TEXT;
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "fit" TEXT;
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "silhouette" TEXT;
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "styleEra" TEXT;
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "careGuess" TEXT;
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "deepSummary" TEXT;

-- Create TripPlan model
CREATE TABLE IF NOT EXISTS "TripPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "startDate" TEXT,
    "endDate" TEXT,
    "bagType" TEXT,
    "bagSize" TEXT,
    "bagNotes" TEXT,
    "weatherSummary" TEXT,
    "packingList" JSONB,
    "dailyOutfits" JSONB,
    "styleNotes" TEXT,
    "avoidItems" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bookingLinks" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripPlan_pkey" PRIMARY KEY ("id")
);

-- Add foreign key
ALTER TABLE "TripPlan" ADD CONSTRAINT "TripPlan_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create index
CREATE INDEX IF NOT EXISTS "TripPlan_userId_createdAt_idx" ON "TripPlan"("userId", "createdAt" DESC);
