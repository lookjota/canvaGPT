ALTER TABLE "visual_proposal_actions" DROP CONSTRAINT "visual_proposal_actions_node_id_fkey";
ALTER TABLE "visual_proposal_actions" ALTER COLUMN "node_id" DROP NOT NULL;
ALTER TABLE "visual_proposal_actions" ADD CONSTRAINT "visual_proposal_actions_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "canvas_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
