import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: [".loca.lt"],
  },
  build: {
    // A5 — split large libraries into separate chunks to reduce initial bundle size.
    rollupOptions: {
      output: {
        manualChunks(id) {
          // pdfjs-dist: only loaded on demand via dynamic import in cvParse.ts
          if (id.includes("pdfjs-dist")) return "pdfjs";
          // recharts and its direct d3 dependencies
          if (id.includes("recharts")) return "recharts";
          // remaining d3 modules (used by psychometricCalculations)
          if (id.includes("/d3-") || id.includes("/d3/")) return "d3";
        },
      },
    },
  },
});
