ALTER TABLE "Comment"
ADD COLUMN "pinnedAt" TIMESTAMP(3);

CREATE INDEX "Comment_postId_pinnedAt_idx" ON "Comment"("postId", "pinnedAt");
