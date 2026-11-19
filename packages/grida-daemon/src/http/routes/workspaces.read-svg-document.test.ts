import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DaemonServer } from "../../daemon-server";
import {
  createDaemonFixture,
  type DaemonFixture,
} from "../../test/daemon-fixture";
import { DaemonTransport } from "../../transport";

const SVG_LIMIT = 8 * 1024 * 1024;
const image =
  '<image href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jr9sAAAAASUVORK5CYII=" width="1" height="1"/>';

function svgAtSize(size: number) {
  const start = `<svg xmlns="http://www.w3.org/2000/svg">${image}<!--`;
  const end = "--></svg>";
  return start + " ".repeat(size - start.length - end.length) + end;
}

describe("compatibility SVG document reads", () => {
  let fixture: DaemonFixture;
  let daemon: DaemonServer;
  let transport: DaemonTransport.Client;

  beforeEach(async () => {
    fixture = await createDaemonFixture("grida-daemon-svg-read-");
    const origin = "https://editor.fixture.invalid";
    const password = "test-svg-read";
    daemon = new DaemonServer({
      password,
      http_access: {
        allowed_origins: [origin],
        allowed_referer_paths: ["/desktop"],
      },
      user_data_path: fixture.user_data_dir,
    });
    await daemon.start({ listen: false });
    transport = new DaemonTransport.Client({
      base_url: "http://daemon.fixture.invalid",
      password,
      origin,
      referer: origin + "/desktop",
      fetch: (resource, init) => daemon.fetch(new Request(resource, init)),
    });
  });

  afterEach(async () => {
    await daemon.stop();
    await fixture.cleanup();
  });

  it("opens, saves and reopens SVG document source at the inclusive workspace limit", async () => {
    const id = fixture.workspace.id;
    const name = "slide.SVG";
    const read = (filename: string) =>
      transport.workspaces.read_svg_document(id, filename);
    const source = svgAtSize(SVG_LIMIT);
    await fixture.write_workspace_file(name, source);
    const opened = await read(name);
    expect("content" in opened && opened.content === source).toBe(true);
    if (!("mtime" in opened)) throw new Error("Missing SVG modification time");

    const edited = opened.content.replace('width="1"', 'width="2"');
    await transport.workspaces.write_file(id, name, edited, opened.mtime);
    const reopened = await read(name);
    expect("content" in reopened && reopened.content === edited).toBe(true);
    await expect(
      transport.workspaces.read_file(id, name)
    ).rejects.toMatchObject({
      code: "file-too-large",
    });

    await fixture.write_workspace_file("notes.txt", "a".repeat(1024 * 1024));
    await expect(
      transport.workspaces.read_file(id, "notes.txt")
    ).resolves.toHaveProperty("mtime");
    await fs.truncate(
      path.join(fixture.workspace_root, "notes.txt"),
      1024 * 1024 + 1
    );
    await expect(
      transport.workspaces.read_file(id, "notes.txt")
    ).rejects.toMatchObject({
      code: "file-too-large",
    });
    await expect(read("notes.txt")).rejects.toMatchObject({
      code: "not-an-svg-document",
    });

    await fs.truncate(path.join(fixture.workspace_root, name), SVG_LIMIT + 1);
    await expect(read(name)).resolves.toEqual({
      error: "file-too-large",
      size: SVG_LIMIT + 1,
      max_size: SVG_LIMIT,
    });
  });

  it("uses the same ceiling and reports the selected file name for registered documents", async () => {
    const name = "drawing.svg";
    const source = svgAtSize(SVG_LIMIT);
    await fixture.write_workspace_file(name, source);
    const filename = path.join(fixture.workspace_root, name);
    const { doc_id: id } = await transport.files.register(filename);
    const opened = await transport.files.read(id);
    expect(opened.filename).toBe(name);
    expect(opened.content === source).toBe(true);

    await fs.truncate(filename, SVG_LIMIT + 1);
    await expect(transport.files.read(id)).rejects.toMatchObject({
      code: "file-too-large",
      message: expect.stringContaining(
        "drawing.svg is 8,388,609 bytes. The SVG limit is 8 MiB."
      ),
    });
  });

  it("preserves containment and UTF-8 validation for workspace SVG reads", async () => {
    const id = fixture.workspace.id;
    const read = (filename: string) =>
      transport.workspaces.read_svg_document(id, filename);
    await expect(read("../outside.svg")).rejects.toMatchObject({
      code: "path-escapes-workspace",
    });
    await fs.writeFile(
      path.join(fixture.workspace_root, "binary.svg"),
      Buffer.from([0xff])
    );
    await expect(read("binary.svg")).rejects.toMatchObject({
      code: "file-not-utf8",
    });
  });
});
