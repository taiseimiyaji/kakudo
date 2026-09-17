import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { check, integer, doublePrecision, foreignKey, index, jsonb, pgEnum, unique, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Add each domain's tables with its implementation phase and a migration.
export const workspaces = pgTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const learningStatus = pgEnum("learning_status", ["NOT_STARTED", "LEARNING", "REVIEWING", "LEARNED"]);
export const roadmapEdgeType = pgEnum("roadmap_edge_type", ["PREREQUISITE", "PARENT", "RELATED"]);
export const roadmaps = pgTable("roadmaps", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  title: text("title").notNull(), description: text("description").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("roadmaps_workspace_idx").on(t.workspaceId), unique("roadmaps_workspace_id_unique").on(t.workspaceId, t.id)]);
export const learningNodes = pgTable("learning_nodes", {
  id: text("id").primaryKey(),
  roadmapId: text("roadmap_id").notNull().references(() => roadmaps.id, { onDelete: "cascade" }),
  title: text("title").notNull(), description: text("description").notNull().default(""),
  positionX: doublePrecision("position_x").notNull().default(0), positionY: doublePrecision("position_y").notNull().default(0),
  status: learningStatus("status").notNull().default("NOT_STARTED"),
  learningObjectives: jsonb("learning_objectives").$type<string[]>().notNull().default([]),
  guidingQuestions: jsonb("guiding_questions").$type<string[]>().notNull().default([]),
}, (t) => [unique("nodes_roadmap_id_unique").on(t.roadmapId, t.id)]);
export const roadmapEdges = pgTable("roadmap_edges", {
  id: text("id").primaryKey(), roadmapId: text("roadmap_id").notNull().references(() => roadmaps.id, { onDelete: "cascade" }),
  sourceId: text("source_id").notNull(), targetId: text("target_id").notNull(), type: roadmapEdgeType("type").notNull(),
}, (t) => [
  foreignKey({ columns: [t.roadmapId, t.sourceId], foreignColumns: [learningNodes.roadmapId, learningNodes.id] }).onDelete("cascade"),
  foreignKey({ columns: [t.roadmapId, t.targetId], foreignColumns: [learningNodes.roadmapId, learningNodes.id] }).onDelete("cascade"),
  unique("edges_connection_unique").on(t.roadmapId, t.sourceId, t.targetId, t.type),
  check("edges_no_self", sql`${t.sourceId} <> ${t.targetId}`),
]);

export const documents = pgTable("documents", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  currentRevisionId: text("current_revision_id"),
  title: text("title").notNull(), path: text("path").notNull().unique(), lastWriteId: text("last_write_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("documents_workspace_idx").on(t.workspaceId), foreignKey({ columns: [t.id, t.currentRevisionId], foreignColumns: [documentRevisions.documentId, documentRevisions.id] })]);
export const documentNodes = pgTable("document_nodes", {
  documentId: text("document_id").notNull().references((): AnyPgColumn => documents.id, { onDelete: "cascade" }),
  nodeId: text("node_id").notNull().references(() => learningNodes.id, { onDelete: "cascade" }),
}, (t) => [unique("document_nodes_unique").on(t.documentId, t.nodeId)]);
// Durable compensation journal, not the canonical document content.
export const documentWriteIntents = pgTable("document_write_intents", {
  id: text("id").primaryKey(), documentId: text("document_id").notNull().unique(), path: text("path").notNull(),
  kind: text("kind").$type<"CREATE" | "UPDATE" | "DELETE">().notNull(), before: text("before"), after: text("after"),
});

export const quotes = pgTable("quotes", {
  id: text("id").primaryKey(), documentId: text("document_id").notNull().references((): AnyPgColumn => documents.id, { onDelete: "cascade" }),
  text: text("text").notNull(), sourceUrl: text("source_url").notNull(), sourceTitle: text("source_title"),
  accessedAt: timestamp("accessed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("quotes_document_idx").on(t.documentId)]);

export const resourceType = pgEnum("resource_type", ["WEB", "OFFICIAL_DOC", "RFC", "PAPER", "OTHER"]);
export const resources = pgTable("resources", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  url: text("url").notNull(), title: text("title").notNull().default(""), type: resourceType("type").notNull().default("WEB"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique("resources_workspace_url_unique").on(t.workspaceId, t.url), index("resources_workspace_idx").on(t.workspaceId)]);
export const nodeResources = pgTable("node_resources", {
  nodeId: text("node_id").notNull().references(() => learningNodes.id, { onDelete: "cascade" }),
  resourceId: text("resource_id").notNull().references(() => resources.id, { onDelete: "cascade" }),
}, (t) => [unique("node_resources_unique").on(t.nodeId, t.resourceId)]);
export const documentResources = pgTable("document_resources", {
  documentId: text("document_id").notNull().references((): AnyPgColumn => documents.id, { onDelete: "cascade" }),
  resourceId: text("resource_id").notNull().references(() => resources.id, { onDelete: "cascade" }),
}, (t) => [unique("document_resources_unique").on(t.documentId, t.resourceId)]);

export const documentRevisions = pgTable("document_revisions", {
  id: text("id").primaryKey(), documentId: text("document_id").notNull().references((): AnyPgColumn => documents.id, { onDelete: "cascade" }),
  contentHash: text("content_hash").notNull(), contentSnapshot: text("content_snapshot").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("revisions_document_idx").on(t.documentId), unique("revisions_document_id_unique").on(t.documentId, t.id)]);

export const reviewType = pgEnum("review_type", ["FACT_CHECK", "LOGIC", "COVERAGE", "SOURCE", "FULL"]);
export const reviewStatus = pgEnum("review_status", ["QUEUED", "RUNNING", "COMPLETED", "FAILED"]);
export const findingCategory = pgEnum("finding_category", ["FACT", "SOURCE", "LOGIC", "COVERAGE", "FRESHNESS", "CLARITY"]);
export const findingSeverity = pgEnum("finding_severity", ["INFO", "WARNING", "IMPORTANT"]);
export const findingStatus = pgEnum("finding_status", ["OPEN", "RESOLVED", "DISMISSED"]);
export const evidenceSourceType = pgEnum("evidence_source_type", ["USER_RESOURCE", "OFFICIAL", "PRIMARY", "SECONDARY"]);
export const reviewRuns = pgTable("review_runs", {
  id: text("id").primaryKey(), documentId: text("document_id").notNull().references((): AnyPgColumn => documents.id, { onDelete: "cascade" }), revisionId: text("revision_id").notNull(),
  type: reviewType("type").notNull(), status: reviewStatus("status").notNull().default("QUEUED"), provider: text("provider").notNull(), stage: text("stage").notNull().default("QUEUED"), error: text("error"),
  objectives: jsonb("objectives").$type<import("../modules/review/contracts").LearningObjective[]>().notNull().default([]),
  quoteSnapshot: jsonb("quote_snapshot").$type<import("../shared/review").QuoteSnapshot[]>().notNull().default([]),
  resourceSnapshot: jsonb("resource_snapshot").$type<import("../shared/review").SourceSnapshot[][]>().notNull().default([]),
  sourceChecks: jsonb("source_checks").$type<import("../shared/review").SourceCheck[]>().notNull().default([]),
  coverage: jsonb("coverage").$type<import("../modules/review/contracts").CoverageResult[]>().notNull().default([]), notices: jsonb("notices").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), completedAt: timestamp("completed_at", { withTimezone: true }),
}, (t) => [foreignKey({ name: "review_revision_document_fk", columns: [t.documentId, t.revisionId], foreignColumns: [documentRevisions.documentId, documentRevisions.id] }).onDelete("cascade"), index("reviews_document_idx").on(t.documentId)]);
export const reviewFindings = pgTable("review_findings", {
  id: text("id").primaryKey(), reviewRunId: text("review_run_id").notNull().references(() => reviewRuns.id, { onDelete: "cascade" }),
  category: findingCategory("category").notNull(), severity: findingSeverity("severity").notNull(), status: findingStatus("status").notNull().default("OPEN"),
  targetText: text("target_text"), startOffset: integer("start_offset"), endOffset: integer("end_offset"), explanation: text("explanation").notNull(), guidingQuestion: text("guiding_question"), verdict: text("verdict"),
}, (t) => [index("findings_run_idx").on(t.reviewRunId)]);
export const findingEvidence = pgTable("finding_evidence", {
  id: text("id").primaryKey(), findingId: text("finding_id").notNull().references(() => reviewFindings.id, { onDelete: "cascade" }), url: text("url").notNull(), title: text("title").notNull(), excerpt: text("excerpt"),
  sourceType: evidenceSourceType("source_type").notNull(), accessedAt: timestamp("accessed_at", { withTimezone: true }).notNull(),
}, (t) => [index("evidence_finding_idx").on(t.findingId)]);
