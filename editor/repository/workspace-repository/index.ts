import { FigmaFilesStore, FileResponseRecord } from "@editor/figma-file-store";

export type LastUsedFileDisplay = FileResponseRecord & { type: "file" } & {
  lastUsed: Date;
};
export type LastusedDisplayType = LastUsedFileDisplay;

export class WorkspaceRepository {
  constructor() {}

  async getRecents({ count = 4 }: { count?: number }) {
    const fetches: LastusedDisplayType[] = [];
    const files = (await this.getFiles()).map(
      (f) =>
        <LastusedDisplayType>{
          ...f,
          type: "file",
        }
    );
    fetches.push(...files);
    // fetches.push(this.getRecentScenes());
    // fetches.push(this.getRecentComponents());

    const allRecents = await Promise.all(fetches);
    const recents = allRecents
      .sort((r, r2) => (r2.lastUsed > r.lastUsed ? 1 : -1))
      .slice(0, count);

    return recents;
  }

  async getFiles() {
    return FigmaFilesStore.all();
  }

  async getRecentScenes() {
    const dummy = (id) => [
      {
        id: id,
        name: "dummy scene 1",
        lastUsed: new Date("2021-01-01"),
      },
    ];
    return Array.from(Array(0).keys()).map((i) => dummy(i));
  }
  async getRecentComponents() {
    const dummy = (id) => ({
      id: id,
      file: "x7RRK6RwWtZuNakmbMLTVH",
      fileName: "@app",
      name: "dummy component " + id,
      lastUsed: new Date("2021-01-01"),
    });
    return ["1:2", "2422:10181", "2422:10298", "1608:1308", "1608:1271"].map(
      (i) => dummy(i)
    );
  }
}
