#!/usr/bin/env node
/**
 * 场景：TestHub supervised sidecar — 起 Django（SQLite 嵌入配置）+ Vite（反代 API），保持前台存活。
 * 用法：node testhub-sidecar.mjs --frontend-port 13080 --backend-port 18080 --work-dir <dataRoot>
 */
import { spawn, execFile } from "node:child_process";
import { access, constants as fsConstants, mkdir, writeFile, appendFile, readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createWriteStream, openSync } from "node:fs";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const runtimeDir = path.join(repoRoot, ".agnx/runtime");

function parseArgs(argv) {
  let workDir = process.env.AGNX_APP_DATA_ROOT || path.join(repoRoot, ".agnx-testhub-runtime");
  let frontendPort = Number(process.env.AGNX_TESTHUB_FRONTEND_PORT || 13080);
  let backendPort = Number(process.env.AGNX_TESTHUB_BACKEND_PORT || 18080);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if ((arg === "--work-dir" || arg === "--workDir") && next) {
      workDir = String(next).trim();
      i += 1;
    } else if ((arg === "--frontend-port" || arg === "--frontendPort") && next) {
      const n = Number(next);
      if (Number.isFinite(n) && n > 0) frontendPort = n;
      i += 1;
    } else if ((arg === "--backend-port" || arg === "--backendPort") && next) {
      const n = Number(next);
      if (Number.isFinite(n) && n > 0) backendPort = n;
      i += 1;
    }
  }
  return { workDir, frontendPort, backendPort, repoRoot };
}

async function pathExists(p) {
  try {
    await access(p, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
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

async function waitFor(url, timeoutMs, log) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await httpGetOk(url)) return true;
    await new Promise((r) => setTimeout(r, 800));
  }
  await log(`健康检查超时: ${url}`);
  return false;
}

async function resolvePython312() {
  const candidates = [
    process.env.AGNX_TESTHUB_PYTHON,
    "/usr/local/opt/python@3.12/bin/python3.12",
    "/opt/homebrew/opt/python@3.12/bin/python3.12",
    "python3.12",
    "python3",
  ].filter(Boolean);
  for (const bin of candidates) {
    try {
      const { stdout } = await execFileAsync(bin, ["-c", "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"], {
        timeout: 8000,
      });
      const ver = String(stdout || "").trim();
      const [maj, min] = ver.split(".").map(Number);
      if (maj === 3 && min >= 11 && min <= 12) {
        return bin;
      }
      if (maj === 3 && min === 12) return bin;
    } catch {
      // try next
    }
  }
  return null;
}

function djangoEnv(cfg, dataRoot) {
  return {
    ...process.env,
    DJANGO_SETTINGS_MODULE: "testhub_agnx_settings",
    PYTHONPATH: [runtimeDir, cfg.repoRoot, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter),
    AGNX_TESTHUB_DATA_ROOT: dataRoot,
    AGNX_TESTHUB_FRONTEND_PORT: String(cfg.frontendPort),
    AGNX_TESTHUB_BACKEND_PORT: String(cfg.backendPort),
    AGNX_TESTHUB_FRONTEND_ORIGIN: `http://127.0.0.1:${cfg.frontendPort}`,
    SECRET_KEY: process.env.SECRET_KEY || "agnx-testhub-dev-secret-change-me",
    DEBUG: "True",
    JUDGE_MOCK: "1",
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || "sk-mock",
  };
}

async function ensureEnvFile(cfg, log) {
  const envPath = path.join(cfg.repoRoot, ".env");
  if (await pathExists(envPath)) {
    await log(".env 已存在");
    return;
  }
  const example = path.join(cfg.repoRoot, ".env.example");
  let body = "";
  if (await pathExists(example)) {
    body = await readFile(example, "utf8");
  }
  body +=
    "\n# Agnx embed overrides\nSECRET_KEY=agnx-testhub-dev-secret-change-me\nDEBUG=True\nJUDGE_MOCK=1\n";
  await writeFile(envPath, body, "utf8");
  await log("已从 .env.example 生成 .env");
}

async function ensureVenv(cfg, pythonBin, log) {
  const venvDir = path.join(cfg.workDir, "venv");
  const venvPython = path.join(venvDir, "bin", "python");
  const marker = path.join(venvDir, ".agnx-reqs-ok");
  if (!(await pathExists(venvPython))) {
    await log(`创建 venv: ${venvDir}`);
    await execFileAsync(pythonBin, ["-m", "venv", venvDir], {
      cwd: cfg.repoRoot,
      timeout: 120_000,
    });
  }
  if (!(await pathExists(marker))) {
    const req = path.join(runtimeDir, "requirements-agnx.txt");
    await log("pip install requirements-agnx.txt（首次较慢）…");
    await execFileAsync(
      venvPython,
      ["-m", "pip", "install", "--upgrade", "pip", "setuptools", "wheel"],
      { cwd: cfg.repoRoot, timeout: 180_000, maxBuffer: 8 * 1024 * 1024 },
    );
    await execFileAsync(venvPython, ["-m", "pip", "install", "-r", req], {
      cwd: cfg.repoRoot,
      timeout: 600_000,
      maxBuffer: 16 * 1024 * 1024,
    });
    await writeFile(marker, new Date().toISOString(), "utf8");
    await log("pip 依赖安装完成");
  } else {
    await log("复用已有 venv 依赖");
  }
  return venvPython;
}

async function djangoManage(venvPython, cfg, dataRoot, args, log) {
  await log(`manage.py ${args.join(" ")}`);
  await execFileAsync(venvPython, ["manage.py", ...args], {
    cwd: cfg.repoRoot,
    env: djangoEnv(cfg, dataRoot),
    timeout: 180_000,
    maxBuffer: 8 * 1024 * 1024,
  });
}

async function ensureSuperuser(venvPython, cfg, dataRoot, log) {
  const script = `
import os
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "testhub_agnx_settings")
import django
django.setup()
from django.contrib.auth import get_user_model
User = get_user_model()
username = os.environ.get("AGNX_TESTHUB_ADMIN_USER", "admin")
password = os.environ.get("AGNX_TESTHUB_ADMIN_PASSWORD", "agnx-testhub")
email = os.environ.get("AGNX_TESTHUB_ADMIN_EMAIL", "admin@localhost")
u, created = User.objects.get_or_create(username=username, defaults={"email": email})
u.is_staff = True
u.is_superuser = True
u.set_password(password)
u.save()
print("created" if created else "updated", username)
`;
  const tmp = path.join(cfg.workDir, "ensure_superuser.py");
  await writeFile(tmp, script, "utf8");
  await execFileAsync(venvPython, [tmp], {
    cwd: cfg.repoRoot,
    env: djangoEnv(cfg, dataRoot),
    timeout: 60_000,
  });
  await log("超级用户就绪：admin / agnx-testhub");
}

async function ensureFrontendDeps(cfg, log) {
  const nm = path.join(cfg.repoRoot, "frontend/node_modules");
  if (await pathExists(nm)) {
    await log("frontend node_modules 已存在");
    return;
  }
  await log("frontend npm install…");
  await execFileAsync("npm", ["install", "--no-fund", "--no-audit"], {
    cwd: path.join(cfg.repoRoot, "frontend"),
    timeout: 600_000,
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, npm_config_fund: "false" },
  });
}

function spawnLogged(command, args, { cwd, env, logFile }) {
  const fd = openSync(logFile, "a");
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: ["ignore", fd, fd],
  });
  child.on("exit", () => {
    try {
      // fd 可能与其它子进程共享；不强制 close
    } catch {
      // ignore
    }
  });
  return child;
}

async function main() {
  const cfg = parseArgs(process.argv.slice(2));
  await mkdir(cfg.workDir, { recursive: true });
  const dataRoot = path.join(cfg.workDir, "django-data");
  await mkdir(dataRoot, { recursive: true });
  const logFile = path.join(cfg.workDir, "sidecar.log");
  const log = async (line) => {
    const msg = `[testhub-sidecar] ${new Date().toISOString()} ${line}\n`;
    process.stderr.write(msg);
    await appendFile(logFile, msg).catch(() => {});
  };

  await log(`启动 workDir=${cfg.workDir} fe=${cfg.frontendPort} be=${cfg.backendPort}`);

  const pythonBin = await resolvePython312();
  if (!pythonBin) {
    await log("ERROR: 未找到 Python 3.11/3.12。请 brew install python@3.12");
    process.exit(1);
  }
  await log(`使用 Python: ${pythonBin}`);

  try {
    await ensureEnvFile(cfg, log);
    const venvPython = await ensureVenv(cfg, pythonBin, log);
    await djangoManage(venvPython, cfg, dataRoot, ["makemigrations", "--noinput"], log);
    await djangoManage(venvPython, cfg, dataRoot, ["migrate", "--noinput"], log);
    await ensureSuperuser(venvPython, cfg, dataRoot, log);
    await ensureFrontendDeps(cfg, log);

    const children = [];

    const backendChild = spawnLogged(
      venvPython,
      ["-m", "daphne", "-b", "127.0.0.1", "-p", String(cfg.backendPort), "backend.asgi:application"],
      {
        cwd: cfg.repoRoot,
        env: djangoEnv(cfg, dataRoot),
        logFile,
      },
    );
    children.push(backendChild);
    await log(`Django/daphne pid=${backendChild.pid}`);

    const backendReady = await waitFor(`http://127.0.0.1:${cfg.backendPort}/api/docs/`, 90_000, log);
    if (!backendReady) {
      // docs 可能需 auth；退回 admin
      const alt = await waitFor(`http://127.0.0.1:${cfg.backendPort}/admin/login/`, 30_000, log);
      if (!alt) {
        await log("ERROR: Django 未就绪");
        process.exit(1);
      }
    }

    const viteBin = path.join(cfg.repoRoot, "frontend/node_modules/vite/bin/vite.js");
    if (!(await pathExists(viteBin))) {
      await log(`ERROR: 找不到 vite: ${viteBin}`);
      process.exit(1);
    }
    const viteConfig = path.join(cfg.repoRoot, "frontend/vite.config.agnx.mjs");
    const frontendChild = spawnLogged(
      process.execPath,
      [viteBin, "--config", viteConfig, "--host", "127.0.0.1", "--port", String(cfg.frontendPort)],
      {
        cwd: path.join(cfg.repoRoot, "frontend"),
        env: {
          ...process.env,
          AGNX_TESTHUB_FRONTEND_PORT: String(cfg.frontendPort),
          AGNX_TESTHUB_BACKEND_PORT: String(cfg.backendPort),
        },
        logFile,
      },
    );
    children.push(frontendChild);
    await log(`Vite pid=${frontendChild.pid}`);

    const feReady = await waitFor(`http://127.0.0.1:${cfg.frontendPort}/`, 120_000, log);
    if (!feReady) {
      await log("ERROR: Vite 未就绪");
      process.exit(1);
    }
    await log(`就绪 origin=http://127.0.0.1:${cfg.frontendPort}/`);

    try {
      const statePath = path.join(cfg.workDir, "testhub.json");
      await writeFile(
        statePath,
        JSON.stringify(
          {
            fingerprint: JSON.stringify({
              repoRoot: cfg.repoRoot,
              port: cfg.frontendPort,
              backendPort: cfg.backendPort,
            }),
            port: cfg.frontendPort,
            backendPort: cfg.backendPort,
            pid: process.pid,
            warnings: [],
            updatedAt: Date.now(),
          },
          null,
          2,
        ),
        "utf8",
      );
    } catch (error) {
      await log(`写 state 失败: ${error instanceof Error ? error.message : String(error)}`);
    }

    const shutdown = (signal) => {
      for (const c of children) {
        try {
          c.kill("SIGTERM");
        } catch {
          // ignore
        }
      }
      process.exit(signal === "SIGTERM" ? 0 : 1);
    };
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));

    for (const c of children) {
      c.on("exit", (code, signal) => {
        log(`子进程退出 code=${code} signal=${signal}`).finally(() => {
          shutdown("child-exit");
        });
      });
    }

    // 保持存活
    await new Promise(() => {});
  } catch (error) {
    const msg = error instanceof Error ? error.stack || error.message : String(error);
    await log(`ERROR: ${msg}`);
    process.exit(1);
  }
}

main();
