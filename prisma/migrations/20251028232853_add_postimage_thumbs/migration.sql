/*
  Warnings:

  - You are about to drop the column `url` on the `PostImage` table. All the data in the column will be lost.
  - Added the required column `original` to the `PostImage` table without a default value. This is not possible if the table is not empty.
  - Added the required column `thumbLg` to the `PostImage` table without a default value. This is not possible if the table is not empty.
  - Added the required column `thumbMd` to the `PostImage` table without a default value. This is not possible if the table is not empty.
  - Added the required column `thumbSm` to the `PostImage` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PostImage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "original" TEXT NOT NULL,
    "thumbSm" TEXT NOT NULL,
    "thumbMd" TEXT NOT NULL,
    "thumbLg" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    CONSTRAINT "PostImage_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PostImage" ("id", "postId") SELECT "id", "postId" FROM "PostImage";
DROP TABLE "PostImage";
ALTER TABLE "new_PostImage" RENAME TO "PostImage";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
