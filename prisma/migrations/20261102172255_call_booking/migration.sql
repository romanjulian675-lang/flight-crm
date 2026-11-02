-- CreateEnum
CREATE TYPE "CalendarStatus" AS ENUM ('ACTIVE', 'BROKEN');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('CONFIRMED', 'CANCELED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityType" ADD VALUE 'CALL_BOOKED';
ALTER TYPE "ActivityType" ADD VALUE 'CALL_CANCELED';

-- AlterEnum
ALTER TYPE "IntegrationKind" ADD VALUE 'BOOKING';

-- CreateTable
CREATE TABLE "CalendarConnection" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'google',
    "email" TEXT NOT NULL,
    "refreshTokenEnc" TEXT NOT NULL,
    "accessTokenEnc" TEXT,
    "accessTokenExpiresAt" TIMESTAMPTZ(3),
    "scope" TEXT,
    "status" "CalendarStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CalendarConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingPage" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "integrationId" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 30,
    "bufferMin" INTEGER NOT NULL DEFAULT 0,
    "minNoticeMin" INTEGER NOT NULL DEFAULT 240,
    "daysAhead" INTEGER NOT NULL DEFAULT 14,
    "timeZone" TEXT NOT NULL DEFAULT 'America/New_York',
    "hours" JSONB NOT NULL,
    "hostIds" UUID[],
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BookingPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallBooking" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "pageId" UUID NOT NULL,
    "leadId" UUID,
    "hostId" UUID NOT NULL,
    "startAt" TIMESTAMPTZ(3) NOT NULL,
    "endAt" TIMESTAMPTZ(3) NOT NULL,
    "activeStart" TIMESTAMPTZ(3),
    "status" "BookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "visitorName" TEXT NOT NULL,
    "visitorEmail" TEXT NOT NULL,
    "visitorPhone" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "answers" JSONB NOT NULL,
    "googleEventId" TEXT,
    "meetLink" TEXT,
    "taskId" UUID,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallBooking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CalendarConnection_membershipId_key" ON "CalendarConnection"("membershipId");

-- CreateIndex
CREATE INDEX "CalendarConnection_orgId_idx" ON "CalendarConnection"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingPage_integrationId_key" ON "BookingPage"("integrationId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingPage_slug_key" ON "BookingPage"("slug");

-- CreateIndex
CREATE INDEX "BookingPage_orgId_idx" ON "BookingPage"("orgId");

-- CreateIndex
CREATE INDEX "CallBooking_orgId_hostId_startAt_idx" ON "CallBooking"("orgId", "hostId", "startAt");

-- CreateIndex
CREATE INDEX "CallBooking_orgId_leadId_idx" ON "CallBooking"("orgId", "leadId");

-- CreateIndex
CREATE INDEX "CallBooking_pageId_createdAt_idx" ON "CallBooking"("pageId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CallBooking_hostId_activeStart_key" ON "CallBooking"("hostId", "activeStart");

-- AddForeignKey
ALTER TABLE "CalendarConnection" ADD CONSTRAINT "CalendarConnection_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarConnection" ADD CONSTRAINT "CalendarConnection_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingPage" ADD CONSTRAINT "BookingPage_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingPage" ADD CONSTRAINT "BookingPage_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallBooking" ADD CONSTRAINT "CallBooking_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallBooking" ADD CONSTRAINT "CallBooking_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "BookingPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallBooking" ADD CONSTRAINT "CallBooking_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallBooking" ADD CONSTRAINT "CallBooking_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallBooking" ADD CONSTRAINT "CallBooking_canceledById_fkey" FOREIGN KEY ("canceledById") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
