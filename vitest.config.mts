import { defineConfig } from "vitest/config";
import "dotenv/config";

export default defineConfig({ test: { fileParallelism: false, environment: "node", testTimeout: 15000, hookTimeout: 30000 } });
