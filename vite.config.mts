import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    root: "client",
    plugins: [react()],
    build: { outDir: "../dist/client", emptyOutDir: true },
    server: {
      host: "127.0.0.1",
      port: 43170,
      strictPort: true,
      proxy: { "^/api(?:/|$)": `http://127.0.0.1:${process.env.PORT ?? env.PORT ?? "43171"}` },
    },
  };
});
