-- AlterTable
ALTER TABLE "UserSettings" ADD COLUMN "popupSearchEnabled" BOOLEAN NOT NULL DEFAULT 1;
ALTER TABLE "UserSettings" ADD COLUMN "popupSummarizeEnabled" BOOLEAN NOT NULL DEFAULT 1;
