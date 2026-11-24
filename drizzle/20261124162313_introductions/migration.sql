CREATE TYPE "introduction_status" AS ENUM('pending', 'passed', 'accepted');--> statement-breakpoint
CREATE TABLE "introductions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "introductions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"candidate_id" integer NOT NULL,
	"date" date NOT NULL,
	"status" "introduction_status" DEFAULT 'pending'::"introduction_status" NOT NULL,
	"conversation_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "introductions_once" UNIQUE("user_id","candidate_id")
);
--> statement-breakpoint
CREATE INDEX "introductions_user_date_idx" ON "introductions" ("user_id","date");--> statement-breakpoint
ALTER TABLE "introductions" ADD CONSTRAINT "introductions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "introductions" ADD CONSTRAINT "introductions_candidate_id_users_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "introductions" ADD CONSTRAINT "introductions_conversation_id_conversations_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL;