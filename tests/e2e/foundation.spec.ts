import { expect, test } from "@playwright/test";

test("learner can open the seeded workspace", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("書いて、辿って、確かめる。");
  await page.getByRole("link", { name: "Workspaceを開く" }).click();
  await expect(page.getByRole("heading", { name: "My Knowledge Workspace" })).toBeVisible();
  await expect(page.getByText("Workspaceの準備ができました")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Knowledge Map" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Generate|Rewrite|Apply Fix|Fix with AI|Complete/ })).toHaveCount(0);
});

test("health endpoint checks real database connectivity", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: "ok", database: "connected" });
});

test("landing is usable at a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Workspaceを開く" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});


test("direct workspace URLs and reloads work with the built SPA", async ({ page, request }) => {
  await page.goto("/workspaces/default");
  await expect(page.getByRole("heading", { name: "My Knowledge Workspace" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "My Knowledge Workspace" })).toBeVisible();
  const unknown = await request.get("/api/unknown");
  expect(unknown.status()).toBe(404);
  expect(unknown.headers()["content-type"]).toContain("application/json");
  expect((await request.get("/.env")).status()).toBe(404);
});

test("SPA distinguishes missing workspace and unavailable API", async ({ page }) => {
  await page.route("**/api/workspaces/default", (route) => route.fulfill({ status: 404, json: { error: "Workspace not found" } }));
  await page.goto("/workspaces/default");
  await expect(page.getByRole("heading", { name: "Workspaceの準備が必要です" })).toBeVisible();
  await page.unroute("**/api/workspaces/default");
  await page.route("**/api/workspaces/default", (route) => route.fulfill({ status: 503, json: { error: "Workspace unavailable" } }));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Workspaceに接続できません" })).toBeVisible();
});
