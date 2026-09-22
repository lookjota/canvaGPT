CREATE TYPE "VisualProposalStatus" AS ENUM ('PROPOSED');

CREATE TABLE "visual_proposals" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "assistant_message_id" UUID NOT NULL,
    "status" "VisualProposalStatus" NOT NULL DEFAULT 'PROPOSED',
    "protocol_version" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "visual_proposals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "visual_proposals_assistant_message_id_key" ON "visual_proposals"("assistant_message_id");
CREATE INDEX "visual_proposals_project_id_created_at_idx" ON "visual_proposals"("project_id", "created_at");
CREATE INDEX "visual_proposals_conversation_id_created_at_idx" ON "visual_proposals"("conversation_id", "created_at");
ALTER TABLE "visual_proposals" ADD CONSTRAINT "visual_proposals_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "visual_proposals" ADD CONSTRAINT "visual_proposals_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "visual_proposals" ADD CONSTRAINT "visual_proposals_assistant_message_id_fkey" FOREIGN KEY ("assistant_message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
