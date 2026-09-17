CREATE TABLE "document_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"content_hash" text NOT NULL,
	"content_snapshot" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "revisions_document_id_unique" UNIQUE("document_id","id")
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "current_revision_id" text;--> statement-breakpoint
ALTER TABLE "document_revisions" ADD CONSTRAINT "document_revisions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "revisions_document_idx" ON "document_revisions" USING btree ("document_id");--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_id_current_revision_id_document_revisions_document_id_id_fk" FOREIGN KEY ("id","current_revision_id") REFERENCES "public"."document_revisions"("document_id","id") ON DELETE no action ON UPDATE no action;