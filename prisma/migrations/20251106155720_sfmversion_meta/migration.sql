-- AlterTable
ALTER TABLE "SfmVersion" ADD COLUMN "fileId" TEXT;
ALTER TABLE "SfmVersion" ADD COLUMN "fileUrl" TEXT;
ALTER TABLE "SfmVersion" ADD COLUMN "uploadedAt" DATETIME;

-- CreateIndex
CREATE INDEX "SfmVersion_fileId_idx" ON "SfmVersion"("fileId");

-- CreateIndex
CREATE INDEX "SfmVersion_uploadedAt_idx" ON "SfmVersion"("uploadedAt");
