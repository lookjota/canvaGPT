-- CreateEnum
CREATE TYPE "ProjectMemoryKind" AS ENUM ('FACT', 'DECISION', 'HYPOTHESIS', 'GAP', 'LEARNING');

-- CreateEnum
CREATE TYPE "ProjectMemoryStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProjectMemorySourceType" AS ENUM ('USER', 'CONVERSATION', 'CANVAS_NODE');

-- CreateTable
CREATE TABLE "project_memories" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "kind" "ProjectMemoryKind" NOT NULL,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "status" "ProjectMemoryStatus" NOT NULL DEFAULT 'ACTIVE',
    "confidence" DOUBLE PRECISION,
    "source_type" "ProjectMemorySourceType" NOT NULL,
    "source_ref" TEXT,
    "created_by" UUID NOT NULL,
    "confirmed_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "project_memories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_memories_project_id_status_idx" ON "project_memories"("project_id", "status");
CREATE INDEX "project_memories_project_id_kind_idx" ON "project_memories"("project_id", "kind");

-- AddForeignKey
ALTER TABLE "project_memories" ADD CONSTRAINT "project_memories_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_memories" ADD CONSTRAINT "project_memories_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
