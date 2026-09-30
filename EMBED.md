# TestHub × Agnx 嵌入说明

最后更新：2026-09-30

## 上游嵌入

- 工作方式：整仓魔改（主流 · 真树在 `$AGNX_HOME/apps/testhub`，Dev 默认 `~/.agnx-dev`）
- 推荐模式：Wrap + Sidecar；Agent 工具后置
- 挂载：`guest.auth=none` / 策略=`direct-iframe`（JWT 在嵌页 localStorage）
- 上游：chenjigang4167/testhub_platform（本目录 git remote）
- Port 切片：无（仅 `.agnx/` 胶水 + SQLite 嵌入 settings）
- 默认值：前端 `13080`、后端 `18080`；`JUDGE_MOCK=1`
- 许可证：上游 **GPL-3.0**（分发前过法务）

## 嵌页宿主能力缺口

| 上游能力 | 信号位置 | 嵌后风险 | 处置 (A–E) | 主路径 | 备注 |
| --- | --- | --- | --- | --- | --- |
| 登录 / JWT | Login.vue + Bearer | 嵌页自登录 | D | 是 | 默认超管见下 |
| UI/APP 自动化 / 压测 | 重依赖模块 | 未装 Airtest/Playwright 等 | E | 否 | 装全量 requirements 后开 INSTALLED_APPS |
| SQLite COMMENT | 上游 db_comment | migrate 语法错 | C | 是 | settings 内 noop |
| WebSocket 进度 | Channels | 内存层 | D | 中 | Redis 可选后置 |
| 上传附件 | `<input type=file>` | 一般可用 | D | 是 | |

## 本地起服（已验收）

```bash
# 依赖：Python 3.12（brew install python@3.12）
cd ~/.agnx-dev/apps/testhub/.agnx && npm run build
cd <agnx-monorepo>
npm run sub-apps:register -- --app-id=testhub \
  --url=https://github.com/chenjigang4167/testhub_platform --launch-mode=packaged

# 手测 sidecar
node ~/.agnx-dev/apps/testhub/.agnx/tools/testhub-sidecar.mjs \
  --frontend-port 13080 --backend-port 18080 \
  --work-dir ~/.agnx-dev/apps/data/testhub
```

2026-09-30 本机验收：

- `http://127.0.0.1:13080/` → **200**
- `http://127.0.0.1:18080/admin/login/` → **200**
- `POST /api/auth/login/`（经 Vite 反代）→ JWT **ok**

默认账号（嵌入 SQLite 自动创建）：

- 用户：`admin`
- 密码：`agnx-testhub`

数据：`~/.agnx-dev/apps/data/testhub/`（venv + sqlite + sidecar.log）。

## 模块覆盖（当前嵌入配置）

启用：用户 / 项目 / 用例 / 评审 / API 测试 / 数据工厂 / 需求分析 / LLM Judge / Monitor / MCP 管理端。  
暂缓：UI 自动化、APP 自动化、性能测试（需全量 pip + 改回 `ROOT_URLCONF`）。

## Agnx 内打开

命令面板 → **子应用** → **重新扫描** → 点 **TestHub**。  
Tab 走 `host.guest.mount` + supervised ensure。

## 图标

`manifest.icon` → `./.agnx/assets/testhub-icon.svg`（上游 logo.svg）。
