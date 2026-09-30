// 场景：TestHub Host 绑定单例 — 面板共用。
import type { WorkspaceAppHostApi } from "@getagnx/app-sdk";

let boundHost: WorkspaceAppHostApi | null = null;

export function bindTesthubHost(host: WorkspaceAppHostApi): void {
  boundHost = host;
}

export function requireBoundHost(): WorkspaceAppHostApi {
  if (!boundHost) {
    throw new Error("TestHub Host 尚未绑定");
  }
  return boundHost;
}
