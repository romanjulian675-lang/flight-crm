CREATE TYPE "MetaJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
CREATE TABLE "MetaLeadJob" (
  "id" UUID NOT NULL,
  "orgId" UUID NOT NULL,
  "integrationId" UUID NOT NULL,
  "pageId" TEXT NOT NULL,
  "leadgenId" TEXT NOT NULL,
  "status" "MetaJobStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseToken" TEXT,
  "leaseUntil" TIMESTAMPTZ(3),
  "lastError" TEXT,
  "completedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "MetaLeadJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MetaLeadJob_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MetaLeadJob_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "MetaLeadJob_integrationId_leadgenId_key" ON "MetaLeadJob"("integrationId", "leadgenId");
CREATE INDEX "MetaLeadJob_status_availableAt_idx" ON "MetaLeadJob"("status", "availableAt");
CREATE INDEX "MetaLeadJob_orgId_createdAt_idx" ON "MetaLeadJob"("orgId", "createdAt");
