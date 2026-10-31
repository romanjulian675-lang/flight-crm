-- CreateEnum
CREATE TYPE "SocialChannel" AS ENUM ('MESSENGER', 'INSTAGRAM');

-- AlterTable
ALTER TABLE "MetaPage" ADD COLUMN     "instagramEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "instagramId" TEXT,
ADD COLUMN     "messengerEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "SocialConversation" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "pageId" UUID NOT NULL,
    "leadId" UUID NOT NULL,
    "channel" "SocialChannel" NOT NULL,
    "senderId" TEXT NOT NULL,
    "lastMessageAt" TIMESTAMPTZ(3) NOT NULL,
    "lastInboundAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialMessage" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "providerMessageId" TEXT,
    "requestId" TEXT,
    "direction" "MessageDirection" NOT NULL DEFAULT 'IN',
    "status" "MessageStatus" NOT NULL DEFAULT 'RECEIVED',
    "error" TEXT,
    "body" TEXT,
    "attachmentTypes" TEXT[],
    "receivedAt" TIMESTAMPTZ(3) NOT NULL,
    "readAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SocialConversation_orgId_lastMessageAt_idx" ON "SocialConversation"("orgId", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "SocialConversation_pageId_channel_senderId_key" ON "SocialConversation"("pageId", "channel", "senderId");

-- CreateIndex
CREATE INDEX "SocialMessage_orgId_readAt_idx" ON "SocialMessage"("orgId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "SocialMessage_conversationId_providerMessageId_key" ON "SocialMessage"("conversationId", "providerMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "SocialMessage_conversationId_requestId_key" ON "SocialMessage"("conversationId", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "MetaPage_instagramId_key" ON "MetaPage"("instagramId");

-- AddForeignKey
ALTER TABLE "SocialConversation" ADD CONSTRAINT "SocialConversation_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialConversation" ADD CONSTRAINT "SocialConversation_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "MetaPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialConversation" ADD CONSTRAINT "SocialConversation_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialMessage" ADD CONSTRAINT "SocialMessage_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialMessage" ADD CONSTRAINT "SocialMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "SocialConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

