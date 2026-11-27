-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'NEEDS_CHANGES', 'APPROVED');

-- CreateTable
CREATE TABLE "ContentPost" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "caption" TEXT NOT NULL DEFAULT '',
    "videoUrl" TEXT,
    "coverUrl" TEXT,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "plannedAt" TIMESTAMPTZ(3),
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ContentPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentComment" (
    "id" UUID NOT NULL,
    "postId" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "author" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContentPost_orgId_plannedAt_idx" ON "ContentPost"("orgId", "plannedAt");

-- CreateIndex
CREATE INDEX "ContentPost_orgId_status_idx" ON "ContentPost"("orgId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ContentPost_id_orgId_key" ON "ContentPost"("id", "orgId");

-- CreateIndex
CREATE INDEX "ContentComment_postId_createdAt_idx" ON "ContentComment"("postId", "createdAt");

-- AddForeignKey
ALTER TABLE "ContentPost" ADD CONSTRAINT "ContentPost_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentComment" ADD CONSTRAINT "ContentComment_postId_orgId_fkey" FOREIGN KEY ("postId", "orgId") REFERENCES "ContentPost"("id", "orgId") ON DELETE CASCADE ON UPDATE CASCADE;
