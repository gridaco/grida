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
    return [
      {
        id: "xxx",
        name: "dummy scene 1",
        lastUsed: new Date("2021-01-01"),
      },
    ];
  }
  async getRecentComponents() {
    return [
      {
        id: "xxxx",
        name: "dummy component 1",
        lastUsed: new Date("2021-01-01"),
      },
    ];
  }
}
