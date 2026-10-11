import { defineConfig } from "@playwright/test";
import trial from "./playwright.export-trial.config";
export default defineConfig({ ...trial, testDir: "./tests/e2e", fullyParallel: true, workers: 4 });
