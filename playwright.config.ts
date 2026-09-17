import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

const development = process.env.E2E_DEV === "1";
const url = development ? "http://127.0.0.1:43170" : "http://127.0.0.1:43172";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: url, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: development ? "npm run dev" : "npm run start",
    env: { PORT: development ? "43171" : "43172", HOST: "127.0.0.1" },
    url,
    reuseExistingServer: development && !process.env.CI,
    timeout: 60000,
  },
});
