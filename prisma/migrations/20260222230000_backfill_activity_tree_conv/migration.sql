-- Backfill treeId and conversationId from the JSON payload for existing rows
UPDATE "ActivityLog"
SET "treeId" = json_extract(payload, '$.treeId')
WHERE "treeId" IS NULL
  AND json_extract(payload, '$.treeId') IS NOT NULL;

UPDATE "ActivityLog"
SET "conversationId" = json_extract(payload, '$.conversationId')
WHERE "conversationId" IS NULL
  AND json_extract(payload, '$.conversationId') IS NOT NULL;
