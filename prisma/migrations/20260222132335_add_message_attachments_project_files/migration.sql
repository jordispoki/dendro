-- CreateTable
CREATE TABLE "ProjectFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "treeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectFile_treeId_fkey" FOREIGN KEY ("treeId") REFERENCES "Tree" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "attachments" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Message" ("content", "conversationId", "createdAt", "id", "role") SELECT "content", "conversationId", "createdAt", "id", "role" FROM "Message";
DROP TABLE "Message";
ALTER TABLE "new_Message" RENAME TO "Message";
CREATE TABLE "new_UserSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "systemPrompt" TEXT NOT NULL DEFAULT '',
    "enabledModels" TEXT NOT NULL DEFAULT '[]',
    "defaultConvModel" TEXT NOT NULL DEFAULT 'openrouter/deepseek/deepseek-chat-v3-0324',
    "defaultConvVerbosity" TEXT NOT NULL DEFAULT 'normal',
    "defaultBranchModel" TEXT NOT NULL DEFAULT 'openrouter/deepseek/deepseek-chat-v3-0324',
    "defaultBranchVerbosity" TEXT NOT NULL DEFAULT 'normal',
    "streamingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "localExecutionEnabled" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_UserSettings" ("defaultBranchModel", "defaultBranchVerbosity", "defaultConvModel", "defaultConvVerbosity", "enabledModels", "id", "streamingEnabled", "systemPrompt", "userId") SELECT "defaultBranchModel", "defaultBranchVerbosity", "defaultConvModel", "defaultConvVerbosity", "enabledModels", "id", "streamingEnabled", "systemPrompt", "userId" FROM "UserSettings";
DROP TABLE "UserSettings";
ALTER TABLE "new_UserSettings" RENAME TO "UserSettings";
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
