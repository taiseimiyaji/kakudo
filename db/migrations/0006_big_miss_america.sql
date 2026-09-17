CREATE TYPE "public"."evidence_source_type" AS ENUM('USER_RESOURCE', 'OFFICIAL', 'PRIMARY', 'SECONDARY');--> statement-breakpoint
CREATE TYPE "public"."finding_category" AS ENUM('FACT', 'SOURCE', 'LOGIC', 'COVERAGE', 'FRESHNESS', 'CLARITY');--> statement-breakpoint
CREATE TYPE "public"."finding_severity" AS ENUM('INFO', 'WARNING', 'IMPORTANT');--> statement-breakpoint
CREATE TYPE "public"."finding_status" AS ENUM('OPEN', 'RESOLVED', 'DISMISSED');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."review_type" AS ENUM('FACT_CHECK', 'LOGIC', 'COVERAGE', 'SOURCE', 'FULL');--> statement-breakpoint
CREATE TABLE "finding_evidence" (
	"id" text PRIMARY KEY NOT NULL,
	"finding_id" text NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"excerpt" text,
	"source_type" "evidence_source_type" NOT NULL,
	"accessed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_findings" (
	"id" text PRIMARY KEY NOT NULL,
	"review_run_id" text NOT NULL,
	"category" "finding_category" NOT NULL,
	"severity" "finding_severity" NOT NULL,
	"status" "finding_status" DEFAULT 'OPEN' NOT NULL,
	"target_text" text,
	"start_offset" integer,
	"end_offset" integer,
	"explanation" text NOT NULL,
	"guiding_question" text,
	"verdict" text
);
--> statement-breakpoint
CREATE TABLE "review_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"revision_id" text NOT NULL,
	"type" "review_type" NOT NULL,
	"status" "review_status" DEFAULT 'QUEUED' NOT NULL,
	"provider" text NOT NULL,
	"stage" text DEFAULT 'QUEUED' NOT NULL,
	"error" text,
	"objectives" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"quote_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"resource_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_checks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"coverage" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notices" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "finding_evidence" ADD CONSTRAINT "finding_evidence_finding_id_review_findings_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."review_findings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_findings" ADD CONSTRAINT "review_findings_review_run_id_review_runs_id_fk" FOREIGN KEY ("review_run_id") REFERENCES "public"."review_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_runs" ADD CONSTRAINT "review_runs_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_runs" ADD CONSTRAINT "review_revision_document_fk" FOREIGN KEY ("document_id","revision_id") REFERENCES "public"."document_revisions"("document_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evidence_finding_idx" ON "finding_evidence" USING btree ("finding_id");--> statement-breakpoint
CREATE INDEX "findings_run_idx" ON "review_findings" USING btree ("review_run_id");--> statement-breakpoint
CREATE INDEX "reviews_document_idx" ON "review_runs" USING btree ("document_id");