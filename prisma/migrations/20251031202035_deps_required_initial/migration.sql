/*
  Warnings:

  - Added the required column `slug` to the `Dependency` table without a default value. This is not possible if the table is not empty.
  - Added the required column `source` to the `Dependency` table without a default value. This is not possible if the table is not empty.
  - Added the required column `url` to the `Dependency` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Dependency" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    CONSTRAINT "Dependency_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Dependency" ("id", "name", "postId") SELECT "id", "name", "postId" FROM "Dependency";
DROP TABLE "Dependency";
ALTER TABLE "new_Dependency" RENAME TO "Dependency";
CREATE INDEX "Dependency_slug_idx" ON "Dependency"("slug");
CREATE INDEX "Dependency_source_idx" ON "Dependency"("source");
CREATE TABLE "new_Post" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "modVersion" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "rating" REAL NOT NULL DEFAULT 0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "views" INTEGER NOT NULL DEFAULT 0,
    "uploadDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "code" TEXT NOT NULL,
    "codeStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "codeNote" TEXT,
    "description" TEXT NOT NULL,
    "youtubeUrl" TEXT,
    CONSTRAINT "Post_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Post" ("authorId", "authorName", "categoryId", "code", "description", "id", "modVersion", "rating", "ratingCount", "slug", "title", "uploadDate", "views", "youtubeUrl") SELECT "authorId", "authorName", "categoryId", "code", "description", "id", "modVersion", "rating", "ratingCount", "slug", "title", "uploadDate", "views", "youtubeUrl" FROM "Post";
DROP TABLE "Post";
ALTER TABLE "new_Post" RENAME TO "Post";
CREATE UNIQUE INDEX "Post_slug_key" ON "Post"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
