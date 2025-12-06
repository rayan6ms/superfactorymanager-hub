-- CreateEnum
CREATE TYPE "CodeStatus" AS ENUM ('VERIFIED', 'UNVERIFIED', 'BROKEN');

-- CreateEnum
CREATE TYPE "PostCommitStatus" AS ENUM ('PENDING', 'MERGED', 'REJECTED');

-- CreateEnum
CREATE TYPE "NotificationOrigin" AS ENUM ('SYSTEM', 'POST', 'REPORT');

-- CreateEnum
CREATE TYPE "ReportActionType" AS ENUM ('NOTE', 'RESOLVED', 'MODERATION');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('SPAM', 'INAPPROPRIATE_CONTENT', 'HARASSMENT_OR_BULLYING', 'SPREADS_FALSE_INFORMATION', 'HATE_SPEECH_OR_SYMBOLS', 'PROMOTES_VIOLENCE_OR_DANGEROUS_BEHAVIOR', 'PROMOTES_ILLEGAL_ACTIVITY', 'PROMOTES_SELF_HARM_OR_SUICIDE', 'OTHER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,
    "bio" TEXT,
    "passwordHash" TEXT,
    "emailVerified" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "canCreatePosts" BOOLEAN NOT NULL DEFAULT true,
    "canCreateComments" BOOLEAN NOT NULL DEFAULT true,
    "canVotePosts" BOOLEAN NOT NULL DEFAULT true,
    "canVoteComments" BOOLEAN NOT NULL DEFAULT true,
    "interactionBanUntil" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostTag" (
    "postId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "PostTag_pkey" PRIMARY KEY ("postId","tagId")
);

-- CreateTable
CREATE TABLE "PostImage" (
    "id" TEXT NOT NULL,
    "original" TEXT NOT NULL,
    "thumbSm" TEXT NOT NULL,
    "thumbMd" TEXT NOT NULL,
    "thumbLg" TEXT NOT NULL,
    "postId" TEXT NOT NULL,

    CONSTRAINT "PostImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rating" (
    "id" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "ratedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Rating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailVerificationToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dependency" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "postId" TEXT NOT NULL,

    CONSTRAINT "Dependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SfmVersion" (
    "id" TEXT NOT NULL,
    "gameVersion" TEXT NOT NULL,
    "modVersion" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fileId" TEXT,
    "fileUrl" TEXT,
    "uploadedAt" TIMESTAMP(3),

    CONSTRAINT "SfmVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangelogEntry" (
    "id" TEXT NOT NULL,
    "versionCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isLatest" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChangelogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "modVersion" TEXT NOT NULL,
    "gameVersion" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "workedCount" INTEGER NOT NULL DEFAULT 0,
    "brokenCount" INTEGER NOT NULL DEFAULT 0,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletionFlaggedAt" TIMESTAMP(3),
    "deletionFlaggedByAuto" BOOLEAN NOT NULL DEFAULT false,
    "deletionPurgeAt" TIMESTAMP(3),
    "moderationEditedAt" TIMESTAMP(3),
    "moderationEditedById" TEXT,
    "moderationEditedNote" TEXT,
    "views" INTEGER NOT NULL DEFAULT 0,
    "uploadDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "code" TEXT NOT NULL,
    "codeStatus" "CodeStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "codeNote" TEXT,
    "description" TEXT NOT NULL,
    "youtubeUrl" TEXT,
    "openForImprovement" BOOLEAN NOT NULL DEFAULT false,
    "currentCommitId" TEXT,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostCommit" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT,
    "message" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "PostCommitStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mergedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "baseCommitId" TEXT,

    CONSTRAINT "PostCommit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostContributor" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mergedCommits" INTEGER NOT NULL DEFAULT 0,
    "lastContributionAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostContributor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "parentId" TEXT,
    "score" INTEGER NOT NULL DEFAULT 0,
    "voteCount" INTEGER NOT NULL DEFAULT 0,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletionFlaggedAt" TIMESTAMP(3),
    "deletionFlaggedByAuto" BOOLEAN NOT NULL DEFAULT false,
    "deletionPurgeAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Suggestion" (
    "id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Suggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommentVote" (
    "id" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommentVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "origin" "NotificationOrigin" NOT NULL,
    "link" TEXT,
    "imageUrl" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "postId" TEXT,
    "commentId" TEXT,
    "reason" "ReportReason" NOT NULL DEFAULT 'OTHER',
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportAction" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "type" "ReportActionType" NOT NULL,
    "note" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_name_key" ON "User"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Category_key_key" ON "Category"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_slug_key" ON "Tag"("slug");

-- CreateIndex
CREATE INDEX "PostTag_tagId_idx" ON "PostTag"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "Rating_userId_postId_key" ON "Rating"("userId", "postId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "Dependency_slug_idx" ON "Dependency"("slug");

-- CreateIndex
CREATE INDEX "Dependency_source_idx" ON "Dependency"("source");

-- CreateIndex
CREATE INDEX "SfmVersion_source_idx" ON "SfmVersion"("source");

-- CreateIndex
CREATE INDEX "SfmVersion_fileId_idx" ON "SfmVersion"("fileId");

-- CreateIndex
CREATE INDEX "SfmVersion_uploadedAt_idx" ON "SfmVersion"("uploadedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SfmVersion_gameVersion_modVersion_key" ON "SfmVersion"("gameVersion", "modVersion");

-- CreateIndex
CREATE UNIQUE INDEX "ChangelogEntry_versionCode_key" ON "ChangelogEntry"("versionCode");

-- CreateIndex
CREATE UNIQUE INDEX "Post_slug_key" ON "Post"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Post_currentCommitId_key" ON "Post"("currentCommitId");

-- CreateIndex
CREATE INDEX "PostCommit_postId_createdAt_idx" ON "PostCommit"("postId", "createdAt");

-- CreateIndex
CREATE INDEX "PostCommit_status_idx" ON "PostCommit"("status");

-- CreateIndex
CREATE INDEX "PostContributor_postId_mergedCommits_idx" ON "PostContributor"("postId", "mergedCommits");

-- CreateIndex
CREATE UNIQUE INDEX "PostContributor_postId_userId_key" ON "PostContributor"("postId", "userId");

-- CreateIndex
CREATE INDEX "Comment_postId_createdAt_idx" ON "Comment"("postId", "createdAt");

-- CreateIndex
CREATE INDEX "Comment_authorId_createdAt_idx" ON "Comment"("authorId", "createdAt");

-- CreateIndex
CREATE INDEX "Comment_parentId_idx" ON "Comment"("parentId");

-- CreateIndex
CREATE INDEX "CommentVote_commentId_idx" ON "CommentVote"("commentId");

-- CreateIndex
CREATE INDEX "CommentVote_userId_idx" ON "CommentVote"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CommentVote_userId_commentId_key" ON "CommentVote"("userId", "commentId");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Report_postId_idx" ON "Report"("postId");

-- CreateIndex
CREATE INDEX "Report_commentId_idx" ON "Report"("commentId");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- AddForeignKey
ALTER TABLE "PostTag" ADD CONSTRAINT "PostTag_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostTag" ADD CONSTRAINT "PostTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostImage" ADD CONSTRAINT "PostImage_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dependency" ADD CONSTRAINT "Dependency_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_currentCommitId_fkey" FOREIGN KEY ("currentCommitId") REFERENCES "PostCommit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_moderationEditedById_fkey" FOREIGN KEY ("moderationEditedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostCommit" ADD CONSTRAINT "PostCommit_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostCommit" ADD CONSTRAINT "PostCommit_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostCommit" ADD CONSTRAINT "PostCommit_baseCommitId_fkey" FOREIGN KEY ("baseCommitId") REFERENCES "PostCommit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostContributor" ADD CONSTRAINT "PostContributor_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostContributor" ADD CONSTRAINT "PostContributor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Suggestion" ADD CONSTRAINT "Suggestion_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentVote" ADD CONSTRAINT "CommentVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentVote" ADD CONSTRAINT "CommentVote_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportAction" ADD CONSTRAINT "ReportAction_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportAction" ADD CONSTRAINT "ReportAction_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
