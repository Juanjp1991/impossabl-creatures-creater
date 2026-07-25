import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: __dirname,
  base: "./",
  plugins: [react()],
  publicDir: "public",
  build: { outDir: "dist", emptyOutDir: true },
  server: { port: 4174 },
});
