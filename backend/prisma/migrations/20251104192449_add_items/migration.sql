-- CreateEnum
CREATE TYPE "Section" AS ENUM ('Tops', 'Bottoms', 'Dresses', 'Outerwear', 'Footwear', 'Accessories', 'Ethnicwear', 'Sportswear');

-- CreateEnum
CREATE TYPE "Season" AS ENUM ('Spring', 'Summer', 'Autumn', 'Winter');

-- CreateEnum
CREATE TYPE "Occasion" AS ENUM ('Casual', 'Formal', 'Sports', 'Party', 'Ethnic');

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "title" TEXT,
    "brand" TEXT,
    "color" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "material" TEXT,
    "size" TEXT,
    "price" DECIMAL(10,2),
    "season" "Season",
    "occasion" "Occasion",
    "styleTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "section" "Section",
    "predictedLabels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "confidences" DOUBLE PRECISION[] DEFAULT ARRAY[]::DOUBLE PRECISION[],
    "dominantColorHex" TEXT,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "searchText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Item_ownerId_createdAt_idx" ON "Item"("ownerId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
