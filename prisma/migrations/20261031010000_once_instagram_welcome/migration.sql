CREATE TABLE "InstagramWelcome" (
  "id" UUID NOT NULL,
  "orgId" UUID NOT NULL,
  "conversationId" UUID NOT NULL,
  "initialMessageId" TEXT NOT NULL,
  "initialAt" TIMESTAMPTZ(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "lastError" TEXT,
  "attemptedAt" TIMESTAMPTZ(3),
  "completedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InstagramWelcome_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InstagramWelcome_conversationId_key" ON "InstagramWelcome"("conversationId");
CREATE INDEX "InstagramWelcome_status_createdAt_idx" ON "InstagramWelcome"("status", "createdAt");
ALTER TABLE "InstagramWelcome" ADD CONSTRAINT "InstagramWelcome_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "SocialConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
