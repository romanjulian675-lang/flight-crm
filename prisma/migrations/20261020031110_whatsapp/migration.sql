-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('RECEIVED', 'PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- AlterEnum
ALTER TYPE "IntegrationKind" ADD VALUE 'WHATSAPP';

-- AlterEnum
ALTER TYPE "LeadSource" ADD VALUE 'WHATSAPP';

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "waLastInboundAt" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "WhatsAppAccount" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "integrationId" UUID NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "wabaId" TEXT NOT NULL,
    "displayPhone" TEXT,
    "verifiedName" TEXT,
    "accessTokenEnc" TEXT NOT NULL,
    "appSecretEnc" TEXT NOT NULL,
    "verifyToken" TEXT NOT NULL,
    "autoReply" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "WhatsAppAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppMessage" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "leadId" UUID NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "waMessageId" TEXT,
    "type" TEXT NOT NULL,
    "body" TEXT,
    "templateName" TEXT,
    "status" "MessageStatus" NOT NULL,
    "error" TEXT,
    "sentById" UUID,
    "readAt" TIMESTAMPTZ(3),
    "statusAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppAccount_integrationId_key" ON "WhatsAppAccount"("integrationId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppAccount_phoneNumberId_key" ON "WhatsAppAccount"("phoneNumberId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppMessage_waMessageId_key" ON "WhatsAppMessage"("waMessageId");

-- CreateIndex
CREATE INDEX "WhatsAppMessage_orgId_leadId_createdAt_idx" ON "WhatsAppMessage"("orgId", "leadId", "createdAt");

-- CreateIndex
CREATE INDEX "WhatsAppMessage_orgId_direction_readAt_idx" ON "WhatsAppMessage"("orgId", "direction", "readAt");

-- AddForeignKey
ALTER TABLE "WhatsAppAccount" ADD CONSTRAINT "WhatsAppAccount_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppAccount" ADD CONSTRAINT "WhatsAppAccount_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "WhatsAppAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
