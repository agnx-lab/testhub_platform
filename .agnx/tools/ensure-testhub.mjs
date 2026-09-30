#!/usr/bin/env node
/**
 * 场景：TestHub ensure 合同 — supervised 返回 sidecar plan；非 supervised 可自起并健康检查。
 * 用法：node ensure-testhub.mjs [--port 13080] [--backend-port 18080] [--supervised] [--force-restart]
 * stdout：JSON { ok, origin, reused?, plan?, warnings?, error? }
 */
import { spawn } from "node:child_process";
import { access, constants as fsConstants, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const defaultFrontendPort = 13080;
const defaultBackendPort = 18080;
const appId = "testhub";
const ensureId = "ensure-testhub";

function parseArgs(argv) {
  let workDir = process.env.AGNX_APP_DATA_ROOT || "";
  let port = defaultFrontendPort;
  let backendPort = defaultBackendPort;
  let forceRestart = false;
  let supervised = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if ((arg === "--work-dir" || arg === "--workDir") && next) {
      workDir = String(next).trim();
      i += 1;
    } else if (arg === "--port" && next) {
      const n = Number(next);
      if (Number.isFinite(n) && n > 0) port = n;
      i += 1;
    } else if ((arg === "--backend-port" || arg === "--backendPort") && next) {
      const n = Number(next);
      if (Number.isFinite(n) && n > 0) backendPort = n;
      i += 1;
    } else if (arg === "--force-restart" || arg === "--forceRestart") {
      forceRestart = true;
    } else if (arg === "--supervised") {
      supervised = true;
    }
  }
  return {
    workDir: workDir || path.join(repoRoot, ".agnx-testhub-runtime"),
    port,
    backendPort,
    repoRoot,
    forceRestart,
    supervised,
  };
}

async function pathExists(filePath) {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readState(statePath) {
  try {
    return JSON.parse(await readFile(statePath, "utf8"));
  } catch {
    return null;
  }
}

async function writeState(statePath, payload) {
  await writeFile(statePath, JSON.stringify(payload, null, 2), "utf8");
}

function httpGetOk(url) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 2500 }, (res) => {
      res.resume();
      resolve(res.statusCode != null && res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function isWebHealthy(port) {
  return httpGetOk(`http://127.0.0.1:${port}/`);
}

function fingerprint(cfg) {
  return JSON.stringify({
    repoRoot: cfg.repoRoot,
    port: cfg.port,
    backendPort: cfg.backendPort,
  });
}

function stopPid(pid) {
  const n = Number(pid);
  if (!Number.isFinite(n) || n <= 0) return;
  try {
    process.kill(n, "SIGTERM");
  } catch {
    // ignore
  }
}

function sidecarEnv(cfg) {
  return {
    AGNX_TESTHUB_FRONTEND_PORT: String(cfg.port),
    AGNX_TESTHUB_BACKEND_PORT: String(cfg.backendPort),
    AGNX_TESTHUB_FRONTEND_ORIGIN: `http://127.0.0.1:${cfg.port}`,
    AGNX_TESTHUB_DATA_ROOT: path.join(cfg.workDir, "django-data"),
    AGNX_APP_DATA_ROOT: cfg.workDir,
  };
}

function buildPlan(cfg, wantedFp) {
  const sidecar = path.join(repoRoot, ".agnx/tools/testhub-sidecar.mjs");
  return {
    command: process.execPath,
    args: [
      sidecar,
      "--frontend-port",
      String(cfg.port),
      "--backend-port",
      String(cfg.backendPort),
      "--work-dir",
      cfg.workDir,
    ],
    cwd: cfg.repoRoot,
    env: sidecarEnv(cfg),
    fingerprint: wantedFp,
    healthUrl: `http://127.0.0.1:${cfg.port}/`,
    port: cfg.port,
    launchMode: "sidecar",
  };
}

async function tryReused(cfg, statePath, wantedFp) {
  if (cfg.forceRestart) return null;
  if (!(await isWebHealthy(cfg.port))) return null;
  const existing = await readState(statePath);
  // 健康即复用；fingerprint 仅作诊断，避免 JSON 空格差异误杀
  return {
    ok: true,
    reused: true,
    appId,
    ensureId,
    port: cfg.port,
    pid: existing?.pid ?? null,
    origin: `http://127.0.0.1:${cfg.port}/`,
    healthUrl: `http://127.0.0.1:${cfg.port}/`,
    repoRoot: cfg.repoRoot,
    warnings: existing?.warnings || [],
  };
}

async function main() {
  const cfg = parseArgs(process.argv.slice(2));
  const warnings = [];
  await mkdir(cfg.workDir, { recursive: true });
  const statePath = path.join(cfg.workDir, "testhub.json");
  const wantedFp = fingerprint(cfg);

  if (cfg.supervised) {
    const reused = await tryReused(cfg, statePath, wantedFp);
    if (reused) {
      console.log(JSON.stringify({ ...reused, healthUrl: `http://127.0.0.1:${cfg.port}/` }));
      return;
    }
    console.log(
      JSON.stringify({
        ok: true,
        reused: false,
        appId,
        ensureId,
        plan: buildPlan(cfg, wantedFp),
        warnings,
        repoRoot: cfg.repoRoot,
      }),
    );
    return;
  }

  // 非 supervised：自带 sidecar 子进程（开发手测）
  const reused = await tryReused(cfg, statePath, wantedFp);
  if (reused) {
    console.log(JSON.stringify(reused));
    return;
  }

  if (cfg.forceRestart) {
    const existing = await readState(statePath);
    if (existing?.pid) stopPid(existing.pid);
  }

  const plan = buildPlan(cfg, wantedFp);
  const child = spawn(plan.command, plan.args, {
    cwd: plan.cwd,
    env: { ...process.env, ...plan.env },
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  const deadline = Date.now() + 300_000;
  let ready = false;
  while (Date.now() < deadline) {
    if (await isWebHealthy(cfg.port)) {
      ready = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  if (!ready) {
    stopPid(child.pid);
    console.log(
      JSON.stringify({
        ok: false,
        appId,
        ensureId,
        error: "TESTHUB_START_TIMEOUT",
        message:
          "TestHub sidecar 启动超时（300s）。请确认已安装 Python 3.12、并查看 data/testhub/sidecar.log。",
        port: cfg.port,
        repoRoot: cfg.repoRoot,
      }),
    );
    process.exitCode = 1;
    return;
  }

  await writeState(statePath, {
    fingerprint: wantedFp,
    port: cfg.port,
    backendPort: cfg.backendPort,
    pid: child.pid ?? null,
    warnings,
    updatedAt: Date.now(),
  });

  console.log(
    JSON.stringify({
      ok: true,
      reused: false,
      appId,
      ensureId,
      port: cfg.port,
      pid: child.pid ?? null,
      origin: `http://127.0.0.1:${cfg.port}/`,
      repoRoot: cfg.repoRoot,
      warnings,
    }),
  );
}

main().catch((error) => {
  console.log(
    JSON.stringify({
      ok: false,
      appId,
      ensureId,
      error: "ENSURE_CRASH",
      message: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 1;
});
