CREATE TABLE "message_context_memories" (
    "message_id" UUID NOT NULL,
    "memory_id" UUID NOT NULL,
    "kind_snapshot" "ProjectMemoryKind" NOT NULL,
    "title_snapshot" TEXT,
    "content_snapshot" TEXT NOT NULL,
    "confidence_snapshot" DOUBLE PRECISION,
    "source_type_snapshot" "ProjectMemorySourceType" NOT NULL,
    "updated_at_snapshot" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "message_context_memories_pkey" PRIMARY KEY ("message_id", "memory_id")
);

CREATE INDEX "message_context_memories_memory_id_idx" ON "message_context_memories"("memory_id");

ALTER TABLE "message_context_memories" ADD CONSTRAINT "message_context_memories_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
