-- CreateEnum
CREATE TYPE "AssignMode" AS ENUM ('NONE', 'ROUND_ROBIN');

-- CreateEnum
CREATE TYPE "IntegrationKind" AS ENUM ('WEB_FORM', 'WEBHOOK', 'GOOGLE_ADS', 'META');

-- CreateEnum
CREATE TYPE "IntakeStatus" AS ENUM ('CREATED', 'MERGED', 'DUPLICATE', 'REJECTED', 'ERROR');

-- AlterEnum
ALTER TYPE "ActivityType" ADD VALUE 'FORM_SUBMITTED';

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "assignMode" "AssignMode" NOT NULL DEFAULT 'ROUND_ROBIN',
ADD COLUMN     "rrCursorId" UUID;

-- CreateTable
CREATE TABLE "Integration" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "kind" "IntegrationKind" NOT NULL,
    "name" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "defaultSource" "LeadSource" NOT NULL DEFAULT 'WEBSITE',
    "defaultProgram" "Program" NOT NULL DEFAULT 'PRIVATE',
    "defaultOwnerId" UUID,
    "config" JSONB,
    "lastEventAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntakeEvent" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "integrationId" UUID NOT NULL,
    "status" "IntakeStatus" NOT NULL,
    "externalId" TEXT,
    "leadId" UUID,
    "summary" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntakeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaPage" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "integrationId" UUID NOT NULL,
    "pageId" TEXT NOT NULL,
    "pageName" TEXT NOT NULL,
    "accessTokenEnc" TEXT NOT NULL,
    "subscribed" BOOLEAN NOT NULL DEFAULT false,
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MetaPage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Integration_token_key" ON "Integration"("token");

-- CreateIndex
CREATE INDEX "Integration_orgId_idx" ON "Integration"("orgId");

-- CreateIndex
CREATE INDEX "IntakeEvent_orgId_createdAt_idx" ON "IntakeEvent"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "IntakeEvent_integrationId_createdAt_idx" ON "IntakeEvent"("integrationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IntakeEvent_integrationId_externalId_key" ON "IntakeEvent"("integrationId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "MetaPage_pageId_key" ON "MetaPage"("pageId");

-- CreateIndex
CREATE INDEX "MetaPage_orgId_idx" ON "MetaPage"("orgId");

-- AddForeignKey
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_defaultOwnerId_fkey" FOREIGN KEY ("defaultOwnerId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeEvent" ADD CONSTRAINT "IntakeEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeEvent" ADD CONSTRAINT "IntakeEvent_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeEvent" ADD CONSTRAINT "IntakeEvent_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaPage" ADD CONSTRAINT "MetaPage_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaPage" ADD CONSTRAINT "MetaPage_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
