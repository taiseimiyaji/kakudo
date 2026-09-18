import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

const development = process.env.E2E_DEV === "1";
const url = development ? "http://127.0.0.1:43173" : "http://127.0.0.1:43172";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: url, trace: "retain-on-failure", extraHTTPHeaders: { Origin: url } },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: development ? "npm run dev" : "npm run start",
    env: { REVIEW_PROVIDER: "mock", SEARCH_PROVIDER: "mock", PORT: development ? "43174" : "43172", DEV_WEB_PORT: "43173", HOST: "127.0.0.1", ALLOWED_ORIGINS: url },
    url,
    reuseExistingServer: false,
    timeout: 60000,
  },
});
