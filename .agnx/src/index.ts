/**
 * 场景：TestHub Sub App 入口 — 导出 activate（Panel 见 panel.tsx）。
 */
import type { WorkspaceAppHostApi, WorkspaceAppModule } from "@getagnx/app-sdk";
import { activate as activatePanel } from "./panel";
import { TESTHUB_APP_ID, TESTHUB_OPEN_COMMAND_ID, TESTHUB_PANEL_ID } from "./constants";

export const appId = TESTHUB_APP_ID;

export function activate(host: WorkspaceAppHostApi): void | (() => void) {
  return activatePanel(host);
}

const moduleExport: WorkspaceAppModule = {
  appId: TESTHUB_APP_ID,
  activate,
};

export default moduleExport;

export { TESTHUB_APP_ID, TESTHUB_OPEN_COMMAND_ID, TESTHUB_PANEL_ID } from "./constants";
export { TesthubPanel } from "./panel";
