ALTER TABLE "conversations" ADD COLUMN "user_id" UUID;
ALTER TABLE "conversations" ADD COLUMN "title" TEXT;
ALTER TABLE "conversations" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "conversations" SET "user_id" = "projects"."owner_id"
FROM "projects" WHERE "projects"."id" = "conversations"."project_id";
ALTER TABLE "conversations" ALTER COLUMN "user_id" SET NOT NULL;

CREATE TABLE "message_context_nodes" (
    "message_id" UUID NOT NULL,
    "node_id" UUID NOT NULL,
    "title_snapshot" TEXT NOT NULL,
    "type_snapshot" "NodeType" NOT NULL,
    "content_snapshot" TEXT NOT NULL,
    CONSTRAINT "message_context_nodes_pkey" PRIMARY KEY ("message_id", "node_id")
);

CREATE INDEX "conversations_project_id_user_id_updated_at_idx" ON "conversations"("project_id", "user_id", "updated_at");
CREATE INDEX "message_context_nodes_node_id_idx" ON "message_context_nodes"("node_id");

ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "message_context_nodes" ADD CONSTRAINT "message_context_nodes_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "message_context_nodes" ADD CONSTRAINT "message_context_nodes_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "canvas_nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
