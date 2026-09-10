// GRIDA-SEC-014 — explicit provider-root forwarding and host isolation.
// GRIDA-SEC-004 / GRIDA-SEC-006 / GRIDA-SEC-008 — host authority forwarding.
// GRIDA-GG: desktop — scoped custody receives the same host origin and transport.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DaemonServer, ShellExecutor } from "@grida/daemon/server";
import type { createMediaDaemon } from "@grida/agent/media-server";
import type { createAgentDaemon } from "@grida/agent/server";
import { DesktopDaemon } from "./daemon";
import { CHATGPT_SUBSCRIPTION_CONFIG } from "../chatgpt-configuration";

const mocks = vi.hoisted(() => ({
  media: vi.fn<typeof createMediaDaemon>(),
  agent: vi.fn<typeof createAgentDaemon>(),
  agentImports: 0,
}));
vi.mock("@grida/agent/media-server", () => ({
  createMediaDaemon: mocks.media,
}));
vi.mock("@grida/agent/server", () => {
  mocks.agentImports++;
  return { createAgentDaemon: mocks.agent };
});

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
    mocks.agent.mockClear();
  });

  it("selects media before importing chat and preserves the host perimeter", async () => {
    const server = {} as DaemonServer;
    mocks.media.mockReturnValueOnce(server);
    expect(await DesktopDaemon.create({ ...common, agent: false })).toBe(
      server
    );
    expect(mocks.agentImports).toBe(0);
    expect(mocks.agent).not.toHaveBeenCalled();
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

  it("forwards full agent authorities and existing Desktop capabilities", async () => {
    const shell = vi.fn<ShellExecutor>();
    await DesktopDaemon.create({
      ...common,
      agent: {
        scratch_base: "/synthetic/scratch",
        skills_root: "/synthetic/skills",
        sandbox_enforced: true,
        shell_executor: shell,
      },
    });
    expect(mocks.media).not.toHaveBeenCalled();
    expect(mocks.agent).toHaveBeenCalledWith(
      expect.objectContaining({
        scratch_base: "/synthetic/scratch",
        skills_root: "/synthetic/skills",
        sandbox_enforced: true,
        shell_executor: shell,
        interactive: true,
        library: true,
        external_agent_execution: "disabled",
        chatgpt: CHATGPT_SUBSCRIPTION_CONFIG,
        provider_http: transport,
        gg_base_url: common.editor_base_url,
      })
    );
  });

  it("withholds finite-command authority without the host sandbox attestation", async () => {
    await DesktopDaemon.create({
      ...common,
      agent: {
        scratch_base: "/synthetic/scratch",
        sandbox_enforced: false,
        shell_executor: vi.fn<ShellExecutor>(),
      },
    });
    expect(mocks.agent.mock.calls[0][0].shell_executor).toBeUndefined();
    expect(mocks.agent.mock.calls[0][0].external_agent_execution).toBe(
      "disabled"
    );
  });
});
