-- AlterTable
ALTER TABLE "User"
ADD COLUMN "emailNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "emailNotifyPost" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "emailNotifySystem" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "emailNotifyReport" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Notification"
ADD COLUMN "emailedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Notification_userId_emailedAt_idx" ON "Notification"("userId", "emailedAt");
