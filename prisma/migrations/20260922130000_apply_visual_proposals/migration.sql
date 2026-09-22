CREATE TYPE "VisualProposalStatus_new" AS ENUM ('PENDING', 'APPLIED', 'REJECTED');

ALTER TABLE "visual_proposals"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "VisualProposalStatus_new"
    USING (CASE WHEN "status"::text = 'PROPOSED' THEN 'PENDING' ELSE "status"::text END)::"VisualProposalStatus_new",
  ALTER COLUMN "status" SET DEFAULT 'PENDING';

DROP TYPE "VisualProposalStatus";
ALTER TYPE "VisualProposalStatus_new" RENAME TO "VisualProposalStatus";

ALTER TABLE "visual_proposals"
  ADD COLUMN "applied_at" TIMESTAMP(3),
  ADD COLUMN "applied_by_profile_id" UUID,
  ADD COLUMN "rejected_at" TIMESTAMP(3),
  ADD COLUMN "rejected_by_profile_id" UUID;

CREATE TABLE "visual_proposal_actions" (
  "id" UUID NOT NULL,
  "proposal_id" UUID NOT NULL,
  "client_action_id" TEXT NOT NULL,
  "node_id" UUID NOT NULL,
  "protocol_version" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "visual_proposal_actions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "visual_proposal_actions_node_id_key" ON "visual_proposal_actions"("node_id");
CREATE UNIQUE INDEX "visual_proposal_actions_proposal_id_client_action_id_key" ON "visual_proposal_actions"("proposal_id", "client_action_id");
CREATE INDEX "visual_proposal_actions_proposal_id_idx" ON "visual_proposal_actions"("proposal_id");

ALTER TABLE "visual_proposals" ADD CONSTRAINT "visual_proposals_applied_by_profile_id_fkey" FOREIGN KEY ("applied_by_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "visual_proposals" ADD CONSTRAINT "visual_proposals_rejected_by_profile_id_fkey" FOREIGN KEY ("rejected_by_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "visual_proposal_actions" ADD CONSTRAINT "visual_proposal_actions_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "visual_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "visual_proposal_actions" ADD CONSTRAINT "visual_proposal_actions_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "canvas_nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
