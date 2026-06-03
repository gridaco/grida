import { app, nativeImage } from "electron";
import path from "node:path";
import { IS_DEV, IS_INSIDERS } from "./env";

export const USE_DEV_INSIDERS_BRANDING = IS_DEV && IS_INSIDERS;

const iconDir = USE_DEV_INSIDERS_BRANDING ? "images/insiders" : "images";

export const RUNTIME_APP_NAME = USE_DEV_INSIDERS_BRANDING
  ? "Grida (Insiders)"
  : "Grida";

export const RUNTIME_APP_ICON = {
  png: path.join(app.getAppPath(), iconDir, "icon.png"),
  ico: path.join(app.getAppPath(), iconDir, "icon.ico"),
} as const;

export function create_runtime_app_icon() {
  return nativeImage.createFromPath(RUNTIME_APP_ICON.png);
}
