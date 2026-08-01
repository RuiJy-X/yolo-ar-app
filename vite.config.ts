import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    entries: ["index.html", "src/main.tsx"],
    include: [
      "react",
      "react-dom",
      "react-router",
      "react-router-dom",
      "framer-motion",
      "lucide-react",
      "clsx",
      "tailwind-merge",
      "class-variance-authority",
    ],
    exclude: ["@ffmpeg/ffmpeg", "@ffmpeg/util"],
  },
  server: {
    host: true,
    port: 5173,
    watch: {
      ignored: [
        "**/.venv/**",
        "**/python-embed/**",
        "**/backend/**",
        "**/backend-bundle/**",
        "**/dist/**",
        "**/out/**",
        "**/release/**",
        "**/training/**",
        "**/*.py",
      ],
    },
    warmup: {
      clientFiles: ["./src/main.tsx", "./src/App.tsx", "./src/pages/Splash.tsx"],
    },
  },
});
