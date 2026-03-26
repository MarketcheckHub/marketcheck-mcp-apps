import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export function createAppViteConfig() {
  return defineConfig({
    plugins: [viteSingleFile()],
    build: {
      outDir: "dist",
      rollupOptions: {
        input: "index.html",
      },
    },
  });
}
