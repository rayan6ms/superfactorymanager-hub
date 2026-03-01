ALTER TABLE "PostImage"
ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY "postId" ORDER BY id) - 1 AS next_position
  FROM "PostImage"
)
UPDATE "PostImage" AS image
SET "position" = ranked.next_position
FROM ranked
WHERE image.id = ranked.id;

CREATE INDEX "PostImage_postId_position_idx" ON "PostImage"("postId", "position");
