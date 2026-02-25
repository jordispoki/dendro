-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "remoteHosts" TEXT NOT NULL DEFAULT '[]',
    "urlFetchSameDomain" BOOLEAN NOT NULL DEFAULT false,
    "homeLayout" TEXT NOT NULL DEFAULT 'select',
    CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_UserSettings" ("defaultBranchModel", "defaultBranchVerbosity", "defaultConvModel", "defaultConvVerbosity", "enabledModels", "homeLayout", "id", "localExecutionEnabled", "streamingEnabled", "systemPrompt", "urlFetchSameDomain", "userId") SELECT "defaultBranchModel", "defaultBranchVerbosity", "defaultConvModel", "defaultConvVerbosity", "enabledModels", "homeLayout", "id", "localExecutionEnabled", "streamingEnabled", "systemPrompt", "urlFetchSameDomain", "userId" FROM "UserSettings";
DROP TABLE "UserSettings";
ALTER TABLE "new_UserSettings" RENAME TO "UserSettings";
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
