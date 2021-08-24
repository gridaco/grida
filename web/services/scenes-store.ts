import { SceneStoreService } from "@base-sdk/scene-store";

export function makeService() {
  if (process.env.NODE_ENV == "development") {
    // ONLY USED FOR DEVELOPMENT
    return new SceneStoreService({
      type: "token",
      token: localStorage.getItem("jwt"),
    });
  } else {
    return new SceneStoreService({
      type: "auto-browser-otp",
    });
  }
}
