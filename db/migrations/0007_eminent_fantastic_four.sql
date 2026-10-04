CREATE TYPE "public"."roadmap_edge_side" AS ENUM('top', 'right', 'bottom', 'left');--> statement-breakpoint
ALTER TABLE "roadmap_edges" ADD COLUMN "source_side" "roadmap_edge_side" DEFAULT 'bottom' NOT NULL;--> statement-breakpoint
ALTER TABLE "roadmap_edges" ADD COLUMN "target_side" "roadmap_edge_side" DEFAULT 'top' NOT NULL;