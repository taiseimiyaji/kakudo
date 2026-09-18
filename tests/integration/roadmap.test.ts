import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { eq, sql } from "drizzle-orm";
import { createDatabase } from "../../db/client";
import { workspaces, learningNodes, roadmapEdges } from "../../db/schema";
import { readTestDatabaseUrl } from "../../lib/env";
import { createApp } from "../../server/app";
import { findWorkspace } from "../../modules/workspace/service";
import { seedRoadmap } from "../../modules/roadmap/seed";
import { roadmapDetailSchema } from "../../shared/roadmap";
const { db, client } = createDatabase(readTestDatabaseUrl());
const workspaceId = `map-test-${randomUUID()}`;
const app = createApp({ database: () => db, findWorkspace: (id) => findWorkspace(id, db), checkDatabase: async () => { await db.execute(sql`select 1`); } });
async function api(path: string, method = "GET", body?: unknown, workspace = workspaceId) {
  return app.request(`/api${path}?workspaceId=${workspace}`, { method, headers: { "Content-Type": "application/json", Origin: "http://127.0.0.1:43171" }, body: body === undefined ? undefined : JSON.stringify(body) });
}
beforeAll(async () => { await migrate(db, { migrationsFolder: "./db/migrations" }); await db.insert(workspaces).values({ id: workspaceId, name: "Map test" }); });
afterAll(async () => { await db.delete(workspaces).where(eq(workspaces.id, workspaceId)); await client.end(); });
describe("roadmap REST and database constraints", () => {
  it("leaves the database unchanged when cross-origin and non-JSON creation are rejected", async () => {
    const before = await (await api("/roadmaps")).json();
    for (const [origin, type, status] of [["https://untrusted.example", "text/plain", 403], ["http://127.0.0.1:43171", "text/plain", 415]] as const) {
      const response = await app.request(`/api/roadmaps?workspaceId=${workspaceId}`, { method: "POST", headers: { Origin: origin, "Content-Type": type }, body: JSON.stringify({ title: "must not exist" }) });
      expect(response.status).toBe(status);
    }
    expect(await (await api("/roadmaps")).json()).toEqual(before);
  });
  it("creates, edits and deletes maps, nodes and edges with workspace isolation", async () => {
    const create = await api("/roadmaps", "POST", { title: "Learning" }); expect(create.status).toBe(201);
    const { roadmap } = await create.json();
    const { roadmap: other } = await (await api("/roadmaps", "POST", { title: "Other" })).json();
    const nodes: { id: string }[] = [];
    for (const title of ["Authentication", "OAuth", "PKCE"]) {
      const response = await api("/nodes", "POST", { roadmapId: roadmap.id, title }); expect(response.status).toBe(201); nodes.push((await response.json()).node);
    }
    expect((await api(`/roadmaps/${roadmap.id}`, "GET", undefined, "another-workspace")).status).toBe(404);
    expect((await api(`/nodes/${nodes[0].id}`, "PATCH", { title: "stolen" }, "another-workspace")).status).toBe(404);
    const { node: foreign } = await (await api("/nodes", "POST", { roadmapId: other.id, title: "Foreign" })).json();
    const connection = { roadmapId: roadmap.id, sourceId: nodes[0].id, targetId: nodes[1].id, type: "PREREQUISITE" };
    expect((await api("/edges", "POST", { ...connection, targetId: foreign.id })).status).toBe(400);
    expect((await api("/edges", "POST", { ...connection, targetId: "missing" })).status).toBe(404);
    expect((await api("/edges", "POST", { ...connection, targetId: nodes[0].id })).status).toBe(400);
    await expect(db.insert(roadmapEdges).values({ id: randomUUID(), ...connection, type: "PREREQUISITE", targetId: foreign.id })).rejects.toThrow();
    const { edge } = await (await api("/edges", "POST", connection)).json();
    expect((await api("/edges", "POST", connection)).status).toBe(409);
    const update = await api(`/nodes/${nodes[1].id}`, "PATCH", { title: "OAuth 2", status: "LEARNING", learningObjectives: ["Explain delegation"], guidingQuestions: ["Who grants access?"], positionX: 120.5, positionY: -31 }); expect(update.status).toBe(200);
    await api(`/roadmaps/${roadmap.id}`, "PATCH", { title: "Backend", description: "My path" });
    const detail = roadmapDetailSchema.parse(await (await api(`/roadmaps/${roadmap.id}`)).json());
    expect(detail.roadmap.title).toBe("Backend"); expect(detail.nodes.find((n) => n.id === nodes[1].id)).toMatchObject({ title: "OAuth 2", positionX: 120.5, positionY: -31, status: "LEARNING", learningObjectives: ["Explain delegation"] });
    expect((await api(`/edges/${edge.id}`, "DELETE")).status).toBe(204);
    await api("/edges", "POST", connection);
    expect((await api(`/nodes/${nodes[0].id}`, "DELETE")).status).toBe(204);
    expect((await (await api(`/roadmaps/${roadmap.id}`)).json()).edges).toHaveLength(0);
    expect((await api(`/roadmaps/${roadmap.id}`, "DELETE")).status).toBe(204);
    expect((await api(`/roadmaps/${roadmap.id}`)).status).toBe(404);
  });
  it("seeds the specified map once, retaining learner edits and deletions", async () => {
    await seedRoadmap(db, workspaceId); const mapId = `${workspaceId}:backend-engineering`;
    const detail = roadmapDetailSchema.parse(await (await api(`/roadmaps/${mapId}`)).json());
    expect(detail.nodes).toHaveLength(8); expect(detail.nodes.find((n) => n.title === "OAuth")?.learningObjectives).toHaveLength(4);
    const id = detail.nodes[0].id;
    await db.update(learningNodes).set({ title: "User title" }).where(eq(learningNodes.id, id));
    await db.delete(learningNodes).where(eq(learningNodes.id, detail.nodes[1].id));
    await Promise.all([seedRoadmap(db, workspaceId), seedRoadmap(db, workspaceId)]);
    const result = roadmapDetailSchema.parse(await (await api(`/roadmaps/${mapId}`)).json());
    expect(result.nodes).toHaveLength(7); expect(result.nodes.find((n) => n.id === id)?.title).toBe("User title");
  });
});
