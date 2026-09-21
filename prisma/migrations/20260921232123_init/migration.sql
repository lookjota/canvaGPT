-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('owner', 'editor', 'viewer');

-- CreateEnum
CREATE TYPE "NodeType" AS ENUM ('note', 'document', 'ai_response', 'task', 'decision', 'prompt', 'file', 'frame');

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT NOT NULL DEFAULT '◈',
    "color" TEXT NOT NULL DEFAULT '#7c3aed',
    "project_summary" TEXT,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_members" (
    "project_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "MemberRole" NOT NULL,

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("project_id","user_id")
);

-- CreateTable
CREATE TABLE "canvas_nodes" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "type" "NodeType" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "status" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "position_x" DOUBLE PRECISION NOT NULL DEFAULT 120,
    "position_y" DOUBLE PRECISION NOT NULL DEFAULT 120,
    "width" DOUBLE PRECISION NOT NULL DEFAULT 240,
    "height" DOUBLE PRECISION NOT NULL DEFAULT 160,
    "parent_node_id" UUID,
    "source_type" TEXT,
    "source_message_id" UUID,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "canvas_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canvas_edges" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "source_node_id" UUID NOT NULL,
    "target_node_id" UUID NOT NULL,
    "relation_type" TEXT NOT NULL,
    "label" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "canvas_edges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_view_state" (
    "project_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "viewport_x" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "viewport_y" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "zoom" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "right_panel_open" BOOLEAN NOT NULL DEFAULT true,
    "right_panel_width" DOUBLE PRECISION NOT NULL DEFAULT 340,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_view_state_pkey" PRIMARY KEY ("project_id","user_id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "context_node_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "node_id" UUID,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "profiles_email_key" ON "profiles"("email");

-- CreateIndex
CREATE INDEX "projects_owner_id_updated_at_idx" ON "projects"("owner_id", "updated_at");

-- CreateIndex
CREATE INDEX "canvas_nodes_project_id_updated_at_idx" ON "canvas_nodes"("project_id", "updated_at");

-- CreateIndex
CREATE INDEX "canvas_edges_project_id_idx" ON "canvas_edges"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "canvas_edges_source_node_id_target_node_id_relation_type_key" ON "canvas_edges"("source_node_id", "target_node_id", "relation_type");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canvas_nodes" ADD CONSTRAINT "canvas_nodes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canvas_nodes" ADD CONSTRAINT "canvas_nodes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canvas_nodes" ADD CONSTRAINT "canvas_nodes_parent_node_id_fkey" FOREIGN KEY ("parent_node_id") REFERENCES "canvas_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canvas_edges" ADD CONSTRAINT "canvas_edges_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canvas_edges" ADD CONSTRAINT "canvas_edges_source_node_id_fkey" FOREIGN KEY ("source_node_id") REFERENCES "canvas_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canvas_edges" ADD CONSTRAINT "canvas_edges_target_node_id_fkey" FOREIGN KEY ("target_node_id") REFERENCES "canvas_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_view_state" ADD CONSTRAINT "project_view_state_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_view_state" ADD CONSTRAINT "project_view_state_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
