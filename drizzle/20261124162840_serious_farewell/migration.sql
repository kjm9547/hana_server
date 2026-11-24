CREATE TYPE "message_kind" AS ENUM('text', 'farewell');--> statement-breakpoint
CREATE TYPE "serious_status" AS ENUM('pending', 'accepted', 'declined');--> statement-breakpoint
CREATE TABLE "serious_requests" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "serious_requests_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"conversation_id" integer NOT NULL,
	"requester_id" integer NOT NULL,
	"status" "serious_status" DEFAULT 'pending'::"serious_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "serious_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "closed_by" integer;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "kind" "message_kind" DEFAULT 'text'::"message_kind" NOT NULL;--> statement-breakpoint
CREATE INDEX "serious_requests_conversation_idx" ON "serious_requests" ("conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "serious_requests_one_pending" ON "serious_requests" ("conversation_id") WHERE "status" = 'pending';--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_closed_by_users_id_fkey" FOREIGN KEY ("closed_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "serious_requests" ADD CONSTRAINT "serious_requests_conversation_id_conversations_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "serious_requests" ADD CONSTRAINT "serious_requests_requester_id_users_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE CASCADE;