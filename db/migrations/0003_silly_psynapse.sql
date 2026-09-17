CREATE TABLE "quotes" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"text" text NOT NULL,
	"source_url" text NOT NULL,
	"source_title" text,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quotes_document_idx" ON "quotes" USING btree ("document_id");