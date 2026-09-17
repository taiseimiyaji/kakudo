import { sql } from "drizzle-orm";
import { check, doublePrecision, foreignKey, index, jsonb, pgEnum, unique, pgTable, text, timestamp } from "drizzle-orm/pg-core";

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
