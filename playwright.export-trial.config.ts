import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
const url = "http://127.0.0.1:43282";
export default defineConfig({ ...base, testDir: "./tests/export-trial", fullyParallel: false, workers: 1,
  use: { ...base.use, baseURL: url, extraHTTPHeaders: { Origin: url }, viewport: { width: 1440, height: 1050 } },
  webServer: { command: "npm run start", url, reuseExistingServer: false, timeout: 60000,
    env: { REVIEW_PROVIDER: "mock", SEARCH_PROVIDER: "mock", PORT: "43282", HOST: "127.0.0.1", ALLOWED_ORIGINS: url } },
});
