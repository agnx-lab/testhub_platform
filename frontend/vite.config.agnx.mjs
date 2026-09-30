/**
 * 场景：Agnx 嵌入用 Vite 配置 — 前端端口可配，API/WS 反代到 Django 后端端口。
 */
import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = __dirname;
const repoRoot = resolve(frontendRoot, "..");

const frontendPort = Number(process.env.AGNX_TESTHUB_FRONTEND_PORT || 13080);
const backendPort = Number(process.env.AGNX_TESTHUB_BACKEND_PORT || 18080);
const backendHttp = `http://127.0.0.1:${backendPort}`;
const backendWs = `ws://127.0.0.1:${backendPort}`;

export default defineConfig(({ mode }) => {
  loadEnv(mode, resolve(frontendRoot, ".."), "");
  return {
    root: frontendRoot,
    envDir: resolve(frontendRoot, ".."),
    plugins: [vue()],
    resolve: {
      alias: {
        "@": resolve(frontendRoot, "src"),
      },
    },
    css: {
      preprocessorOptions: {
        scss: {
          api: "modern-compiler",
          silenceDeprecations: ["legacy-js-api"],
        },
      },
    },
    optimizeDeps: {
      esbuildOptions: {
        target: "es2022",
      },
      force: true,
      exclude: ["tree-sitter"],
    },
    build: {
      target: "es2022",
    },
    server: {
      port: frontendPort,
      host: "127.0.0.1",
      strictPort: true,
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
      proxy: {
        "^/api/": {
          target: backendHttp,
          changeOrigin: true,
          secure: false,
        },
        "^/media/": {
          target: backendHttp,
          changeOrigin: true,
          secure: false,
        },
        "^/admin/": {
          target: backendHttp,
          changeOrigin: true,
          secure: false,
        },
        "^/static/": {
          target: backendHttp,
          changeOrigin: true,
          secure: false,
        },
        "^/app-automation-templates/": {
          target: backendHttp,
          changeOrigin: true,
          secure: false,
        },
        "^/app-automation-reports/": {
          target: backendHttp,
          changeOrigin: true,
          secure: false,
        },
        "^/ws/": {
          target: backendWs,
          ws: true,
          changeOrigin: true,
        },
      },
    },
    assetsInclude: ["**/*.wasm"],
  };
});
