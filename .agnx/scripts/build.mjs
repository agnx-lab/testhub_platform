#!/usr/bin/env node
/**
 * 场景：外置 TestHub 胶水打包 — esbuild 打 CJS dist。
 */
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const agnxRoot = path.resolve(__dirname, "..");
const entry = path.join(agnxRoot, "src/index.ts");
const outDir = path.join(agnxRoot, "dist");
const outFile = path.join(outDir, "index.js");

if (!existsSync(entry)) {
  console.error("[testhub agnx build] 找不到 src/index.ts");
  process.exit(1);
}

const require = createRequire(import.meta.url);
const agnxMonorepoCandidates = [
  path.resolve("/Users/apple/Documents/github/agnx"),
  path.resolve(agnxRoot, "../../../../Documents/github/agnx"),
];
let esbuild;
let resolvedFrom = "";
for (const root of agnxMonorepoCandidates) {
  const candidate = path.join(root, "node_modules/esbuild");
  if (existsSync(candidate)) {
    esbuild = require(candidate);
    resolvedFrom = candidate;
    break;
  }
}
if (!esbuild) {
  try {
    esbuild = require("esbuild");
    resolvedFrom = "esbuild(cwd)";
  } catch {
    console.error(
      "[testhub agnx build] 找不到 esbuild。请在 agnx 仓 npm i，或 .agnx/ 下 npm i -D esbuild。",
    );
    process.exit(1);
  }
}

mkdirSync(outDir, { recursive: true });

await esbuild.build({
  absWorkingDir: agnxRoot,
  entryPoints: [entry],
  outfile: outFile,
  bundle: true,
  format: "cjs",
  platform: "neutral",
  mainFields: ["module", "main", "browser"],
  conditions: ["import", "require", "default"],
  target: ["es2022"],
  jsx: "automatic",
  sourcemap: false,
  minify: true,
  external: [
    "react",
    "react-native",
    "react/jsx-runtime",
    "@getagnx/app-sdk",
    "lucide-react-native",
    "react-native-unistyles",
    "react-native-svg",
  ],
  logLevel: "info",
});

console.log(`[testhub agnx build] ok → .agnx/dist/index.js (via ${resolvedFrom})`);
