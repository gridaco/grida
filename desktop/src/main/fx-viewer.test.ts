import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ObservedWorkbenchDocument } from "./browser-automation";
import { FxViewer } from "./fx-viewer";

const project = "a".repeat(64);
const id = "b".repeat(64);
const instance = "c".repeat(64);
const root = "/workspace";
const projectDirectory = { root, identity: "directory-a" };
const base = "http://127.0.0.1:8787";
const tabId = "tab-a";
const documentId = "document-a";
const workspaceId = "5bd8f11d11d7effe";
const url = `${base}/p/${project}/runs/${id}/`;
const subject = {
  kind: "run",
  reference: {
    kind: "service_entry",
    project_id: project,
    entry_kind: "run",
    entry_id: id,
  },
} as const;
const service = {
  kind: "fx-service-status-v1",
  protocol_version: 1,
  state: "running",
  project_id: project,
  instance_id: instance,
  url: `${base}/`,
};
const artifact = {
  digest: "d".repeat(64),
  name: "badge['sun'].draw/image",
  kind: "image/png",
  size: 42,
  url: "/ignored",
};
const activation = { subject, target: { kind: "artifact", artifact } };
const file = {
  kind: "fx-file-resolution-v1",
  local_path: `${root}/runs/cover.png`,
  source_match: null,
  target: { kind: "artifact", artifact },
};
const signal = new AbortController().signal;

const capture = {
  subject,
  scope_id: "inner",
  selection: {
    kind: "note",
    note_id: "note-a",
    scope_id: "inner",
    text: "private note",
  },
  sampled_at: 1270,
  retained: true,
  local_path: "/private/path",
};

function fixture() {
  let documentLive = true;
  let tabSelected = true;
  const status = vi.fn<ConstructorParameters<typeof FxViewer>[1]>(
    async (args) => (args[0] === "status" ? service : file)
  );
  const checkRoot = vi.fn<ConstructorParameters<typeof FxViewer>[0]>(
    async () => projectDirectory
  );
  const context = vi.fn<() => Promise<ObservedWorkbenchDocument>>(async () => ({
    id: documentId,
    value: capture,
    current: () => documentLive,
  }));
  const scope = {
    workspaceId,
    tabId,
    url,
    selected: () => tabSelected,
    observe: context,
  };
  const open = vi.fn<Parameters<FxViewer["activateFile"]>[2]["open"]>(
    async (_file, current) => current()
  );
  const authorize = vi.fn<Parameters<FxViewer["activateFile"]>[2]["authorize"]>(
    async () => true
  );
  return {
    owner: new FxViewer(checkRoot, status),
    scope,
    status,
    checkRoot,
    context,
    open,
    authorize,
    revoke: () => {
      documentLive = false;
    },
    deselect: () => {
      tabSelected = false;
    },
  };
}

describe("FxViewer.resolvePreview", () => {
  it("resolves the same retained entry after stopping and restarting FX at a different port", async () => {
    const { owner, status } = fixture();
    const reference = { workspaceId, entry: subject.reference };
    const resumedBase = "http://127.0.0.1:9077";
    status
      .mockResolvedValueOnce(service)
      .mockResolvedValueOnce({ ...service, state: "stopped" })
      .mockResolvedValueOnce({
        ...service,
        instance_id: id,
        url: `${resumedBase}/`,
      });
    await expect(owner.resolvePreview(reference, signal)).resolves.toEqual({
      state: "service_ready",
      url,
    });
    await expect(owner.resolvePreview(reference, signal)).resolves.toEqual({
      state: "stopped",
    });
    await expect(owner.resolvePreview(reference, signal)).resolves.toEqual({
      state: "service_ready",
      url: `${resumedBase}/p/${project}/runs/${id}/`,
    });
    expect(status.mock.calls.map(([args]) => args[0])).toEqual([
      "status",
      "status",
      "status",
    ]);
  });
});

describe("FxViewer.captureSelected", () => {
  it("projects portable evidence from the exact tab and independently probes the exact project root", async () => {
    const { owner, scope, status } = fixture();
    await expect(owner.captureSelected(scope, signal)).resolves.toEqual({
      kind: "selection",
      surface: "fx-viewer",
      sampledAt: 1270,
      payload: {
        tabId,
        documentId,
        subject,
        scopeId: "inner",
        selection: {
          kind: "note",
          note_id: "note-a",
          scope_id: "inner",
        },
        retained: true,
      },
    });
    expect(status.mock.calls).toEqual(
      Array.from({ length: 2 }, () => [
        ["status", "--project-root", root, "--json"],
        signal,
      ])
    );
  });

  it("refuses an unrelated or merely loopback-looking location without starting a probe", async () => {
    const { owner, scope, status, context } = fixture();
    for (const other of [
      url.replace("127.0.0.1", "example.test"),
      `${url}#custom`,
      `${url}?project=${project}`,
      url.replace("127.0.0.1", "localhost"),
    ])
      await expect(
        owner.captureSelected({ ...scope, url: other }, signal)
      ).resolves.toBeNull();
    expect(status).not.toHaveBeenCalled();
    expect(context).not.toHaveBeenCalled();
  });

  it("withdraws a capture after the document, tab, project, or service changes", async () => {
    const changedInstance = fixture();
    changedInstance.status
      .mockResolvedValueOnce(service)
      .mockResolvedValueOnce({ ...service, instance_id: id });
    await expect(
      changedInstance.owner.captureSelected(changedInstance.scope, signal)
    ).resolves.toBeNull();

    const movedWorkspace = fixture();
    movedWorkspace.checkRoot
      .mockResolvedValueOnce(projectDirectory)
      .mockResolvedValueOnce({ root, identity: "replaced" });
    await expect(
      movedWorkspace.owner.captureSelected(movedWorkspace.scope, signal)
    ).resolves.toBeNull();

    for (const cause of ["revoke", "deselect"] as const) {
      const pending = fixture();
      pending.status
        .mockResolvedValueOnce(service)
        .mockImplementationOnce(async () => {
          pending[cause]();
          return service;
        });
      await expect(
        pending.owner.captureSelected(pending.scope, signal)
      ).resolves.toBeNull();
    }
  });

  it("does not let a matching URL grant authority to a different or malformed subject", async () => {
    const { owner, scope, context } = fixture();
    context.mockResolvedValueOnce({
      id: documentId,
      value: {
        ...capture,
        subject: {
          ...subject,
          reference: { ...subject.reference, entry_id: instance },
        },
      },
      current: () => true,
    });
    await expect(owner.captureSelected(scope, signal)).resolves.toBeNull();
  });
});

describe("FxViewer.activateFile", () => {
  let f: ReturnType<typeof fixture>;
  beforeEach(() => {
    f = fixture();
  });

  it("requires independent authority before consulting the native resolver", async () => {
    f.authorize.mockResolvedValue(false);
    await expect(
      f.owner.activateFile(f.scope, activation, f, signal)
    ).resolves.toBe("not_authorized");
    expect(f.open).not.toHaveBeenCalled();
    expect(f.status.mock.calls.map(([args]) => args[0])).toEqual(["status"]);
  });

  it("binds the resolver to the authorized catalog and passes an integrity requirement to the document host", async () => {
    await expect(
      f.owner.activateFile(f.scope, activation, f, signal)
    ).resolves.toBe("opened");
    const call = f.status.mock.calls.find(([args]) => args[0] === "files")?.[0];
    expect(call).toEqual([
      "files",
      "resolve",
      "--service-entry",
      "--project",
      root,
      "--reference",
      expect.any(String),
      "--json",
    ]);
    expect(JSON.parse(call![6]!)).toMatchObject({
      subject,
      target: {
        kind: "artifact",
        artifact: { digest: artifact.digest, url: null },
      },
    });
    expect(f.open).toHaveBeenCalledExactlyOnceWith(
      {
        workspaceId,
        relativePath: "runs/cover.png",
        artifact: {
          digest: artifact.digest,
          size: artifact.size,
          name: artifact.name,
        },
      },
      expect.any(Function),
      signal
    );
  });

  it("refuses a path outside the workbench or file resolution after losing the originating viewer", async () => {
    f.status.mockImplementation(async (args) =>
      args[0] === "status"
        ? service
        : { ...file, local_path: "/other/cover.png" }
    );
    await expect(
      f.owner.activateFile(f.scope, activation, f, signal)
    ).resolves.toBe("unavailable");

    f.status.mockImplementation(async (args) => {
      if (args[0] === "status") return service;
      f.revoke();
      return file;
    });
    await expect(
      f.owner.activateFile(f.scope, activation, f, signal)
    ).resolves.toBe("stale");
    expect(f.open).not.toHaveBeenCalled();
  });
});
