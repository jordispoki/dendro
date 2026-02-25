-- AlterTable: store the last terminal run result per conversation
ALTER TABLE "Conversation" ADD COLUMN "terminalResult" TEXT NOT NULL DEFAULT '{}';
