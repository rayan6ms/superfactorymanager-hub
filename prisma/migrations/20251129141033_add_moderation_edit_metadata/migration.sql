-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Post" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "modVersion" TEXT NOT NULL,
    "gameVersion" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "rating" REAL NOT NULL DEFAULT 0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "workedCount" INTEGER NOT NULL DEFAULT 0,
    "brokenCount" INTEGER NOT NULL DEFAULT 0,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletionFlaggedAt" DATETIME,
    "deletionFlaggedByAuto" BOOLEAN NOT NULL DEFAULT false,
    "deletionPurgeAt" DATETIME,
    "moderationEditedAt" DATETIME,
    "moderationEditedById" TEXT,
    "moderationEditedNote" TEXT,
    "views" INTEGER NOT NULL DEFAULT 0,
    "uploadDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "code" TEXT NOT NULL,
    "codeStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "codeNote" TEXT,
    "description" TEXT NOT NULL,
    "youtubeUrl" TEXT,
    "openForImprovement" BOOLEAN NOT NULL DEFAULT false,
    "currentCommitId" TEXT,
    CONSTRAINT "Post_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Post_currentCommitId_fkey" FOREIGN KEY ("currentCommitId") REFERENCES "PostCommit" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Post_moderationEditedById_fkey" FOREIGN KEY ("moderationEditedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Post" ("authorId", "authorName", "brokenCount", "categoryId", "code", "codeNote", "codeStatus", "currentCommitId", "deletionFlaggedAt", "deletionFlaggedByAuto", "deletionPurgeAt", "description", "gameVersion", "id", "isDeleted", "modVersion", "openForImprovement", "rating", "ratingCount", "slug", "title", "updatedAt", "uploadDate", "views", "workedCount", "youtubeUrl") SELECT "authorId", "authorName", "brokenCount", "categoryId", "code", "codeNote", "codeStatus", "currentCommitId", "deletionFlaggedAt", "deletionFlaggedByAuto", "deletionPurgeAt", "description", "gameVersion", "id", "isDeleted", "modVersion", "openForImprovement", "rating", "ratingCount", "slug", "title", "updatedAt", "uploadDate", "views", "workedCount", "youtubeUrl" FROM "Post";
DROP TABLE "Post";
ALTER TABLE "new_Post" RENAME TO "Post";
CREATE UNIQUE INDEX "Post_slug_key" ON "Post"("slug");
CREATE UNIQUE INDEX "Post_currentCommitId_key" ON "Post"("currentCommitId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
