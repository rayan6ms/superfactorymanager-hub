-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Report" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reporterId" TEXT NOT NULL,
    "postId" TEXT,
    "commentId" TEXT,
    "reason" TEXT NOT NULL DEFAULT 'OTHER',
    "message" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Report_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Report_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Report" ("commentId", "createdAt", "id", "message", "postId", "reporterId", "resolvedAt") SELECT "commentId", "createdAt", "id", "message", "postId", "reporterId", "resolvedAt" FROM "Report";
DROP TABLE "Report";
ALTER TABLE "new_Report" RENAME TO "Report";
CREATE INDEX "Report_postId_idx" ON "Report"("postId");
CREATE INDEX "Report_commentId_idx" ON "Report"("commentId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
