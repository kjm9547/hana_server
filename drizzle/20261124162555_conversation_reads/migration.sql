CREATE TABLE "conversation_reads" (
	"conversation_id" integer,
	"user_id" integer,
	"last_read_message_id" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_reads_pkey" PRIMARY KEY("conversation_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "conversation_reads" ADD CONSTRAINT "conversation_reads_conversation_id_conversations_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_reads" ADD CONSTRAINT "conversation_reads_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;