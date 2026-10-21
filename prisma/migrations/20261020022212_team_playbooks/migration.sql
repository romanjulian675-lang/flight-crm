-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "checklist" JSONB,
ADD COLUMN     "firstContactAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "Membership" ADD COLUMN     "acceptsLeads" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "requireNextStep" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "PipelineStage" ADD COLUMN     "checklist" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "playbook" TEXT;

-- CreateTable
CREATE TABLE "AssignmentRule" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "language" TEXT,
    "program" "Program",
    "source" "LeadSource",
    "memberIds" UUID[],
    "cursorId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssignmentRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssignmentRule_orgId_position_idx" ON "AssignmentRule"("orgId", "position");

-- AddForeignKey
ALTER TABLE "AssignmentRule" ADD CONSTRAINT "AssignmentRule_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill first contact from existing timelines (same rule as the app: any call/text/email/meeting
-- except calls whose outcome was voicemail, no answer or wrong number).
UPDATE "Lead" l SET "firstContactAt" = a.first
FROM (
  SELECT "leadId", MIN("createdAt") AS first FROM "Activity"
  WHERE "type" IN ('CALL', 'EMAIL', 'SMS', 'MEETING')
    AND NOT ("type" = 'CALL' AND COALESCE("meta"->>'outcome', 'CONNECTED') <> 'CONNECTED')
  GROUP BY "leadId"
) a
WHERE a."leadId" = l.id AND l."firstContactAt" IS NULL;
