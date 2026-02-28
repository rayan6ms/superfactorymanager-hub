-- AlterTable
ALTER TABLE "Build" ADD COLUMN "tag" TEXT;
ALTER TABLE "Build" ADD COLUMN "tagLower" TEXT;

-- Backfill
UPDATE "Build"
SET "tag" = 'General'
WHERE "tag" IS NULL;

UPDATE "Build"
SET "tagLower" = LOWER("tag")
WHERE "tagLower" IS NULL;

-- Enforce not-null after backfill
ALTER TABLE "Build" ALTER COLUMN "tag" SET NOT NULL;
ALTER TABLE "Build" ALTER COLUMN "tagLower" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Build_visibility_tagLower_idx" ON "Build"("visibility", "tagLower");
