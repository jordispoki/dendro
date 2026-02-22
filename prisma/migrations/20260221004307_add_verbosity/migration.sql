-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Conversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "treeId" TEXT NOT NULL,
    "parentId" TEXT,
    "title" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT 'openrouter/deepseek/deepseek-chat-v3-0324',
    "verbosity" TEXT NOT NULL DEFAULT 'normal',
    "branchText" TEXT,
    "branchMessageId" TEXT,
    "branchSummary" TEXT,
    "closedAt" DATETIME,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Conversation_treeId_fkey" FOREIGN KEY ("treeId") REFERENCES "Tree" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Conversation_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Conversation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Conversation" ("branchMessageId", "branchSummary", "branchText", "closedAt", "createdAt", "deletedAt", "id", "model", "parentId", "title", "treeId") SELECT "branchMessageId", "branchSummary", "branchText", "closedAt", "createdAt", "deletedAt", "id", "model", "parentId", "title", "treeId" FROM "Conversation";
DROP TABLE "Conversation";
ALTER TABLE "new_Conversation" RENAME TO "Conversation";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
