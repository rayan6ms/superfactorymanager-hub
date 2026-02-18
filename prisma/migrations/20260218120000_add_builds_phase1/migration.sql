-- CreateEnum
CREATE TYPE "BuildVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateTable
CREATE TABLE "Build" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nameOriginal" TEXT NOT NULL,
    "nameLower" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "visibility" "BuildVisibility" NOT NULL DEFAULT 'PUBLIC',
    "currentCode" TEXT NOT NULL,
    "forkedFromBuildId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Build_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuildCommit" (
    "id" TEXT NOT NULL,
    "buildId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BuildCommit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Build_userId_nameLower_key" ON "Build"("userId", "nameLower");

-- CreateIndex
CREATE UNIQUE INDEX "Build_userId_slug_key" ON "Build"("userId", "slug");

-- CreateIndex
CREATE INDEX "Build_userId_createdAt_idx" ON "Build"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Build_slug_idx" ON "Build"("slug");

-- CreateIndex
CREATE INDEX "BuildCommit_buildId_createdAt_idx" ON "BuildCommit"("buildId", "createdAt");

-- AddForeignKey
ALTER TABLE "Build" ADD CONSTRAINT "Build_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Build" ADD CONSTRAINT "Build_forkedFromBuildId_fkey" FOREIGN KEY ("forkedFromBuildId") REFERENCES "Build"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuildCommit" ADD CONSTRAINT "BuildCommit_buildId_fkey" FOREIGN KEY ("buildId") REFERENCES "Build"("id") ON DELETE CASCADE ON UPDATE CASCADE;
