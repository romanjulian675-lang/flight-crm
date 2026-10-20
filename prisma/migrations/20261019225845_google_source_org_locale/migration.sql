-- AlterEnum
ALTER TYPE "LeadSource" ADD VALUE 'GOOGLE';

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "locale" TEXT NOT NULL DEFAULT 'en';
