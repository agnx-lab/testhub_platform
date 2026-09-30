/**
 * 场景：TestHub 薄壳 Panel — host.guest.mount；首帧品牌扫光；根贴边满铺。
 */
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ComponentType,
  type ReactElement,
} from "react";
import type { WorkspaceAppBrandLogoLoaderPanelProps, WorkspaceAppHostApi } from "@getagnx/app-sdk";
import {
  DEFAULT_TESTHUB_FRONTEND_PORT,
  TESTHUB_APP_ID,
  TESTHUB_ENSURE_TOOL_REL,
  TESTHUB_OPEN_COMMAND_ID,
  TESTHUB_PANEL_ID,
} from "./constants";
import { bindTesthubHost, requireBoundHost } from "./host-bind";

const WEB_ROOT_STYLE: CSSProperties = {
  flex: "1 1 0%",
  alignSelf: "stretch",
  minHeight: 0,
  minWidth: 0,
  width: "100%",
  height: "100%",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  position: "relative",
  backgroundColor: "transparent",
};

const GUEST_HOST_STYLE: CSSProperties = {
  flex: "1 1 auto",
  minHeight: 0,
  minWidth: 0,
  width: "100%",
  height: "100%",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  position: "relative",
};

const BOOT_LAYER_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 2,
  display: "flex",
  flexDirection: "column",
  background: "rgb(9, 9, 11)",
};

const ERROR_LAYER_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 3,
  display: "flex",
  flexDirection: "column",
  background: "rgba(9,9,11,0.88)",
};

const ERROR_FALLBACK_STYLE: CSSProperties = {
  ...ERROR_LAYER_STYLE,
  alignItems: "center",
  justifyContent: "center",
  color: "#a1a1aa",
  padding: 24,
  textAlign: "center",
};

const RETAIN_REASON = "testhub-open";

function getHost(): WorkspaceAppHostApi {
  return requireBoundHost();
}

function canUseGuestSurface(): boolean {
  return typeof document !== "undefined" && getHost().platform.isWeb;
}

export function TesthubPanel(): ReactElement {
  const guestHostRef = useRef<HTMLDivElement | null>(null);
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const host = getHost();
    host.background?.requestRetain?.({
      appId: TESTHUB_APP_ID,
      active: true,
      reason: RETAIN_REASON,
    });
    return () => {
      host.background?.requestRetain?.({
        appId: TESTHUB_APP_ID,
        active: false,
        reason: RETAIN_REASON,
      });
    };
  }, []);

  useEffect(() => {
    if (!canUseGuestSurface()) {
      setBooting(false);
      setError("当前平台暂不支持嵌入 TestHub，请使用 Agnx 桌面端或网页端。");
      return;
    }
    const host = getHost();
    if (!host.guest?.mount) {
      setBooting(false);
      setError("宿主未提供 host.guest.mount（需升级 Agnx）");
      return;
    }
    const container = guestHostRef.current;
    if (!container) {
      return;
    }
    const unmount = host.guest.mount({
      container,
      ensureTool: TESTHUB_ENSURE_TOOL_REL,
      ensureArgs: ["--port", String(DEFAULT_TESTHUB_FRONTEND_PORT)],
      timeoutMs: 300_000,
      bootOverlay: false,
      onReady: () => {
        setError(null);
        window.setTimeout(() => setBooting(false), 320);
      },
      onError: (detail) => {
        setBooting(false);
        setError(`${detail.code}: ${detail.message}`);
      },
    });
    return unmount;
  }, []);

  const BrandPanel = getHost().ui?.BrandLogoLoaderPanel as
    | ComponentType<WorkspaceAppBrandLogoLoaderPanelProps>
    | undefined;

  return (
    <div style={WEB_ROOT_STYLE} aria-label="TestHub panel">
      <div
        ref={guestHostRef}
        data-agnx-guest-surface-host="true"
        data-testid="workspace-mini-app-testhub-root"
        style={GUEST_HOST_STYLE}
      />
      {booting && !error && BrandPanel ? (
        <div data-agnx-guest-boot-overlay="true" style={BOOT_LAYER_STYLE} role="status">
          <BrandPanel title="正在启动 TestHub…" testID="testhub-boot-overlay" />
        </div>
      ) : null}
      {booting && !error && !BrandPanel ? (
        <div data-agnx-guest-boot-overlay="true" style={ERROR_FALLBACK_STYLE} role="status">
          正在启动 TestHub…
        </div>
      ) : null}
      {error && BrandPanel ? (
        <div style={ERROR_LAYER_STYLE} role="alert">
          <BrandPanel
            title={error}
            description="打开命令面板 → TestHub → 详情，复制 Guest Surface 诊断贴给 AI。首次起服需 Python 3.12 + 依赖安装，可能较久。"
            testID="testhub-mount-error"
          />
        </div>
      ) : null}
      {error && !BrandPanel ? (
        <div style={ERROR_FALLBACK_STYLE} role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}

export function activate(host: WorkspaceAppHostApi): () => void {
  bindTesthubHost(host);
  const disposers: Array<() => void> = [];

  disposers.push(
    host.registerMiniApp({
      id: TESTHUB_PANEL_ID,
      appId: TESTHUB_APP_ID,
      title: "TestHub",
      component: TesthubPanel,
      iframeShortcutCapture: true,
      isolation: {
        mode: "iframe",
        sidecarTools: [TESTHUB_ENSURE_TOOL_REL],
        note: "Tab iframe 加载本仓 TestHub Vue SPA；ensure 拉起 Django + Vite",
      },
    }),
  );

  disposers.push(
    host.registerCommand({
      id: TESTHUB_OPEN_COMMAND_ID,
      appId: TESTHUB_APP_ID,
      title: "TestHub",
      keywords: ["testhub", "测试", "用例", "api测试", "ui自动化", "测试平台"],
      sidebarAction: {
        defaultVisible: true,
        label: "TestHub",
        order: 70,
      },
      run: (context) => {
        host.openSubAppTab({
          appId: TESTHUB_APP_ID,
          panelId: TESTHUB_PANEL_ID,
          serverId: context?.serverId,
          workspaceId: context?.workspaceId,
          currentPathname: context?.currentPathname,
        });
      },
    }),
  );

  return () => {
    for (const d of [...disposers].reverse()) d();
  };
}
