CREATE TABLE "document_nodes" (
	"document_id" text NOT NULL,
	"node_id" text NOT NULL,
	CONSTRAINT "document_nodes_unique" UNIQUE("document_id","node_id")
);
--> statement-breakpoint
CREATE TABLE "document_write_intents" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"path" text NOT NULL,
	"kind" text NOT NULL,
	"before" text,
	"after" text,
	CONSTRAINT "document_write_intents_document_id_unique" UNIQUE("document_id")
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"title" text NOT NULL,
	"path" text NOT NULL,
	"last_write_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_path_unique" UNIQUE("path")
);
--> statement-breakpoint
ALTER TABLE "document_nodes" ADD CONSTRAINT "document_nodes_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_nodes" ADD CONSTRAINT "document_nodes_node_id_learning_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."learning_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documents_workspace_idx" ON "documents" USING btree ("workspace_id");