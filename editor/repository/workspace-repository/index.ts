export class WorkspaceRepository {
  constructor() {}

  async getRecents({ count = 4 }: { count?: number }) {
    const fetches = [];
    fetches.push(this.getRecentFiles());
    fetches.push(this.getRecentScenes());
    fetches.push(this.getRecentComponents());

    const allRecents = await Promise.all(fetches);
    const recents = allRecents.sort((r) => r.lastUsed).slice(0, count);
    return recents;
  }

  async getFiles(): Promise<any[]> {
    return [
      {
        id: "xx",
        name: "dummy file 1",
        lastUsed: new Date("2021-01-01"),
      },
    ];
  }

  async getRecentFiles() {
    return this.getFiles();
  }

  async getRecentScenes() {
    const dummy = (id) => [
      {
        id: id,
        name: "dummy scene 1",
        lastUsed: new Date("2021-01-01"),
      },
    ];
    return Array.from(Array(20).keys()).map((i) => dummy(i));
  }
  async getRecentComponents() {
    const dummy = (id) => ({
      id: id,
      file: "x7RRK6RwWtZuNakmbMLTVH",
      name: "dummy component " + id,
      lastUsed: new Date("2021-01-01"),
    });
    return ["1:2", "2422:10181", "2422:10298", "1608:1308", "1608:1271"].map(
      (i) => dummy(i)
    );
  }
}
