import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ command }) => {
  const base = process.env.NAVIPLAN_BASE ?? (command === "build" ? "/naviplan/" : "/");

  return {
    base,
    plugins: [
      react(),
      VitePWA({
        registerType: "autoUpdate",
        manifest: {
          name: "NaviPlan 学业规划",
          short_name: "NaviPlan",
          description: "面向本科生的培养方案与毕业学分检查工具",
          theme_color: "#f7f4ed",
          background_color: "#f7f4ed",
          display: "standalone",
          start_url: base,
          icons: [
            {
              src: `${base}pwa.svg`,
              sizes: "any",
              type: "image/svg+xml",
              purpose: "any maskable"
            }
          ]
        },
        workbox: {
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          navigateFallback: `${base}index.html`,
          navigateFallbackDenylist: [/^\/tools(?:\/|$)/],
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.pathname.startsWith(`${base}api/`),
              handler: "NetworkFirst",
              options: { cacheName: "naviplan-api" }
            }
          ]
        }
      })
    ],
    server: {
      port: 5173,
      proxy: {
        "/api": "http://127.0.0.1:8090"
      }
    },
    test: {
      environment: "jsdom",
      setupFiles: "./src/test/setup.ts"
    }
  };
});
