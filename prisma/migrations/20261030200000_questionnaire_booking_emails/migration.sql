CREATE TABLE "ProspectEmail" (
  "id" UUID NOT NULL,
  "orgId" UUID NOT NULL,
  "leadId" UUID NOT NULL,
  "integrationId" UUID NOT NULL,
  "submissionId" UUID NOT NULL,
  "recipient" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "replyTo" TEXT NOT NULL,
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
  CONSTRAINT "ProspectEmail_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProspectEmail_submissionId_key" ON "ProspectEmail"("submissionId");
CREATE INDEX "ProspectEmail_status_availableAt_idx" ON "ProspectEmail"("status", "availableAt");
CREATE INDEX "ProspectEmail_orgId_recipient_createdAt_idx" ON "ProspectEmail"("orgId", "recipient", "createdAt");
ALTER TABLE "ProspectEmail" ADD CONSTRAINT "ProspectEmail_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProspectEmail" ADD CONSTRAINT "ProspectEmail_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
