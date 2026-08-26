import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
// Comentado para desarrollo local


// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "localhost",
    port: 8080,
    strictPort: true,
  },
  optimizeDeps: {
    include: ["react/jsx-runtime", "react/jsx-dev-runtime", "react-day-picker"],
  },
  plugins: [
    react(),
    // Comentado para desarrollo local
    // mode === 'development' &&
    // componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@testing-library/jest-dom/vitest": path.resolve(
        __dirname,
        "./node_modules/@testing-library/jest-dom/vitest.js",
      ),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    testTimeout: 20_000,
    hookTimeout: 30_000,
    include: ["src/**/*.spec.ts", "src/**/*.spec.tsx", "supabase/tests/**/*.test.ts"],
  },
}));
