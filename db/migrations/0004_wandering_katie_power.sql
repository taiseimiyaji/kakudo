CREATE TYPE "public"."resource_type" AS ENUM('WEB', 'OFFICIAL_DOC', 'RFC', 'PAPER', 'OTHER');--> statement-breakpoint
CREATE TABLE "document_resources" (
	"document_id" text NOT NULL,
	"resource_id" text NOT NULL,
	CONSTRAINT "document_resources_unique" UNIQUE("document_id","resource_id")
);
--> statement-breakpoint
CREATE TABLE "node_resources" (
	"node_id" text NOT NULL,
	"resource_id" text NOT NULL,
	CONSTRAINT "node_resources_unique" UNIQUE("node_id","resource_id")
);
--> statement-breakpoint
CREATE TABLE "resources" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"url" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"type" "resource_type" DEFAULT 'WEB' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resources_workspace_url_unique" UNIQUE("workspace_id","url")
);
--> statement-breakpoint
ALTER TABLE "document_resources" ADD CONSTRAINT "document_resources_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_resources" ADD CONSTRAINT "document_resources_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node_resources" ADD CONSTRAINT "node_resources_node_id_learning_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."learning_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node_resources" ADD CONSTRAINT "node_resources_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "resources_workspace_idx" ON "resources" USING btree ("workspace_id");