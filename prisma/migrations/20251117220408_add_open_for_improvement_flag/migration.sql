-- CreateTable
CREATE TABLE "PostCommit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "postId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mergedAt" DATETIME,
    "rejectedAt" DATETIME,
    "baseCommitId" TEXT,
    CONSTRAINT "PostCommit_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PostCommit_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PostCommit_baseCommitId_fkey" FOREIGN KEY ("baseCommitId") REFERENCES "PostCommit" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PostContributor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mergedCommits" INTEGER NOT NULL DEFAULT 0,
    "lastContributionAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PostContributor_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PostContributor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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
    "views" INTEGER NOT NULL DEFAULT 0,
    "uploadDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "code" TEXT NOT NULL,
    "codeStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "codeNote" TEXT,
    "description" TEXT NOT NULL,
    "youtubeUrl" TEXT,
    "openForImprovement" BOOLEAN NOT NULL DEFAULT false,
    "currentCommitId" TEXT,
    CONSTRAINT "Post_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Post_currentCommitId_fkey" FOREIGN KEY ("currentCommitId") REFERENCES "PostCommit" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Post" ("authorId", "authorName", "categoryId", "code", "codeNote", "codeStatus", "description", "gameVersion", "id", "modVersion", "rating", "ratingCount", "slug", "title", "uploadDate", "views", "youtubeUrl") SELECT "authorId", "authorName", "categoryId", "code", "codeNote", "codeStatus", "description", "gameVersion", "id", "modVersion", "rating", "ratingCount", "slug", "title", "uploadDate", "views", "youtubeUrl" FROM "Post";
DROP TABLE "Post";
ALTER TABLE "new_Post" RENAME TO "Post";
CREATE UNIQUE INDEX "Post_slug_key" ON "Post"("slug");
CREATE UNIQUE INDEX "Post_currentCommitId_key" ON "Post"("currentCommitId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "PostCommit_postId_createdAt_idx" ON "PostCommit"("postId", "createdAt");

-- CreateIndex
CREATE INDEX "PostCommit_status_idx" ON "PostCommit"("status");

-- CreateIndex
CREATE INDEX "PostContributor_postId_mergedCommits_idx" ON "PostContributor"("postId", "mergedCommits");

-- CreateIndex
CREATE UNIQUE INDEX "PostContributor_postId_userId_key" ON "PostContributor"("postId", "userId");
