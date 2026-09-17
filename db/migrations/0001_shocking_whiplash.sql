CREATE TYPE "public"."learning_status" AS ENUM('NOT_STARTED', 'LEARNING', 'REVIEWING', 'LEARNED');--> statement-breakpoint
CREATE TYPE "public"."roadmap_edge_type" AS ENUM('PREREQUISITE', 'PARENT', 'RELATED');--> statement-breakpoint
CREATE TABLE "learning_nodes" (
	"id" text PRIMARY KEY NOT NULL,
	"roadmap_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"position_x" double precision DEFAULT 0 NOT NULL,
	"position_y" double precision DEFAULT 0 NOT NULL,
	"status" "learning_status" DEFAULT 'NOT_STARTED' NOT NULL,
	"learning_objectives" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"guiding_questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "nodes_roadmap_id_unique" UNIQUE("roadmap_id","id")
);
--> statement-breakpoint
CREATE TABLE "roadmap_edges" (
	"id" text PRIMARY KEY NOT NULL,
	"roadmap_id" text NOT NULL,
	"source_id" text NOT NULL,
	"target_id" text NOT NULL,
	"type" "roadmap_edge_type" NOT NULL,
	CONSTRAINT "edges_connection_unique" UNIQUE("roadmap_id","source_id","target_id","type"),
	CONSTRAINT "edges_no_self" CHECK ("roadmap_edges"."source_id" <> "roadmap_edges"."target_id")
);
--> statement-breakpoint
CREATE TABLE "roadmaps" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roadmaps_workspace_id_unique" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
ALTER TABLE "learning_nodes" ADD CONSTRAINT "learning_nodes_roadmap_id_roadmaps_id_fk" FOREIGN KEY ("roadmap_id") REFERENCES "public"."roadmaps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roadmap_edges" ADD CONSTRAINT "roadmap_edges_roadmap_id_roadmaps_id_fk" FOREIGN KEY ("roadmap_id") REFERENCES "public"."roadmaps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roadmap_edges" ADD CONSTRAINT "roadmap_edges_roadmap_id_source_id_learning_nodes_roadmap_id_id_fk" FOREIGN KEY ("roadmap_id","source_id") REFERENCES "public"."learning_nodes"("roadmap_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roadmap_edges" ADD CONSTRAINT "roadmap_edges_roadmap_id_target_id_learning_nodes_roadmap_id_id_fk" FOREIGN KEY ("roadmap_id","target_id") REFERENCES "public"."learning_nodes"("roadmap_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roadmaps" ADD CONSTRAINT "roadmaps_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "roadmaps_workspace_idx" ON "roadmaps" USING btree ("workspace_id");