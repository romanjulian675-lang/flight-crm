-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "leadAlertEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "leadAlertRecipients" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "LeadAlert" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "leadId" UUID NOT NULL,
    "recipients" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMPTZ(3),
    "leaseToken" TEXT,
    "firstAttemptAt" TIMESTAMPTZ(3),
    "providerId" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMPTZ(3),

    CONSTRAINT "LeadAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeadAlert_leadId_key" ON "LeadAlert"("leadId");

-- CreateIndex
CREATE INDEX "LeadAlert_status_availableAt_idx" ON "LeadAlert"("status", "availableAt");

-- CreateIndex
CREATE INDEX "LeadAlert_orgId_createdAt_idx" ON "LeadAlert"("orgId", "createdAt");

-- AddForeignKey
ALTER TABLE "LeadAlert" ADD CONSTRAINT "LeadAlert_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadAlert" ADD CONSTRAINT "LeadAlert_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
