CREATE TABLE "PostViewDay" (
    "postId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PostViewDay_pkey" PRIMARY KEY ("postId", "day")
);

CREATE INDEX "PostViewDay_day_views_idx" ON "PostViewDay"("day", "views");

ALTER TABLE "PostViewDay"
ADD CONSTRAINT "PostViewDay_postId_fkey"
FOREIGN KEY ("postId") REFERENCES "Post"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
