// GRIDA-SEC-014 — explicit provider-root forwarding and host isolation.
// GRIDA-SEC-004 / GRIDA-SEC-006 / GRIDA-SEC-008 — host authority forwarding.
// GRIDA-GG: desktop — scoped custody receives the same host origin and transport.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DaemonServer } from "@grida/daemon/server";
import type { createMediaDaemon } from "@grida/agent/media-server";
import { DesktopDaemon } from "./daemon";

const mocks = vi.hoisted(() => ({
  media: vi.fn<typeof createMediaDaemon>(),
}));
vi.mock("@grida/agent/media-server", () => ({
  createMediaDaemon: mocks.media,
}));

const transport = {
  request: vi.fn<typeof fetch>(),
  download: vi.fn<typeof fetch>(),
};
const common = {
  password: "synthetic-daemon-password",
  user_data_path: "/synthetic/state",
  provider_home: "/synthetic/shared-home",
  media_root: "/synthetic/media",
  projects_root: "/synthetic/projects",
  editor_base_url: "https://editor.invalid",
  provider_http: transport,
};

describe("Desktop daemon composition", () => {
  beforeEach(() => {
    mocks.media.mockClear();
  });

  it("selects media before importing chat and preserves the host perimeter", async () => {
    const server = {} as DaemonServer;
    mocks.media.mockReturnValueOnce(server);
    expect(await DesktopDaemon.create({ ...common, agent: false })).toBe(
      server
    );
    expect(mocks.media).toHaveBeenCalledWith({
      password: common.password,
      user_data_path: common.user_data_path,
      provider_home: common.provider_home,
      media_root: common.media_root,
      projects_root: common.projects_root,
      gg_base_url: common.editor_base_url,
      provider_http: transport,
      http_access: {
        allowed_origins: [common.editor_base_url],
        allowed_referer_paths: ["/desktop"],
      },
    });
  });

  it("preserves host-owned root exclusions when chat is disabled", async () => {
    const protected_file_roots = [
      "/retained-service",
      "/synthetic/native-chat",
    ];
    await DesktopDaemon.create({
      ...common,
      agent: false,
      protected_file_roots,
    });
    expect(mocks.media).toHaveBeenCalledWith(
      expect.objectContaining({ protected_file_roots })
    );
  });

  it("refuses startup without both host provider operations", async () => {
    for (const provider_http of [undefined, { request: transport.request }]) {
      await expect(
        DesktopDaemon.create({
          ...common,
          agent: false,
          provider_http: provider_http as typeof transport,
        })
      ).rejects.toThrow("desktop_provider_transport_required");
    }
    expect(mocks.media).not.toHaveBeenCalled();
  });

  it("leaves recents to Main only when native chat owns the profile", async () => {
    await DesktopDaemon.create({ ...common, agent: "native-chat" });
    expect(mocks.media).toHaveBeenCalledWith(
      expect.objectContaining({
        capabilities: { recent: false },
        endpoint_settings: true,
      })
    );
  });

  it("preserves ordinary service owners when native chat uses a separate store", async () => {
    const protected_file_roots = [
      "/synthetic/state/sessions.db",
      "/synthetic/scratch",
    ];
    await DesktopDaemon.create({
      ...common,
      agent: "native-chat",
      ordinary_native_chat_services: true,
      protected_file_roots,
    });
    expect(mocks.media).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        user_data_path: common.user_data_path,
        provider_home: common.provider_home,
        media_root: common.media_root,
        projects_root: common.projects_root,
        capabilities: { recent: true },
        endpoint_settings: true,
        protected_file_roots,
      })
    );
    await expect(
      DesktopDaemon.create({
        ...common,
        agent: "native-chat",
        ordinary_native_chat_services: true,
        workspace_catalog: "/synthetic/new-catalog",
      })
    ).rejects.toThrow("ordinary_native_chat_services_invalid");
  });

  it("leaves files and recents to Main without enabling endpoints or chat", async () => {
    const prepare = vi.fn<() => Promise<void>>();
    await DesktopDaemon.create({
      ...common,
      agent: false,
      retained_media_scope: true,
      prepare_provider_custody: prepare,
    });
    expect(mocks.media).toHaveBeenCalledWith(
      expect.objectContaining({
        capabilities: { recent: false, files: false, workspaces: false },
        endpoint_settings: false,
        prepare_provider_custody: prepare,
      })
    );
  });

  it.each([
    true,
    "enabled",
    { scratch_base: "/synthetic/scratch", sandbox_enforced: true },
    { owned_legacy_writer: true },
  ])(
    "refuses a retired chat composition before retained services start: %j",
    async (agent) => {
      await expect(
        DesktopDaemon.create({
          ...common,
          agent,
        } as unknown as DesktopDaemon.Options)
      ).rejects.toThrow("desktop_chat_runtime_retired");
      expect(mocks.media).not.toHaveBeenCalled();
    }
  );
});
