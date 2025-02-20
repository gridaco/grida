export namespace vfs {
  type Path = string | string[];

  export type PathTokens = string[];

  export type FileNode = {
    type: "file";
    name: string;
    key: string;
    path_tokens: PathTokens;
    mimetype: string;
    size: number;
    modified?: string;
    url: string;
    thumbnail?: string;
  };

  export type FolderNode = {
    type: "folder";
    name: string;
    key: string;
    path_tokens: PathTokens;
    size?: number;
    modified?: string;
  };

  export type EntityNode = FileNode | FolderNode;

  export const pathstr = (path: Path) => {
    if (Array.isArray(path)) return path.join("/");
    return path;
  };

  export function tree(
    objects: Record<string, FileNode>
  ): Array<
    EntityNode & { children?: Array<EntityNode & { children?: any[] }> }
  > {
    const result: any[] = [];

    const getFolder = (nodes: any[], name: string, tokens: string[]): any => {
      let folder = nodes.find((n) => n.type === "folder" && n.name === name);
      if (!folder) {
        folder = {
          type: "folder",
          name,
          key: tokens.join("/"),
          path_tokens: tokens,
          children: [],
        };
        nodes.push(folder);
      }
      return folder;
    };

    for (const file of Object.values(objects)) {
      const tokens = file.path_tokens;
      if (tokens.length === 0) continue;
      let current = result;
      // Walk through each token in the path
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (i === tokens.length - 1) {
          // Last token: add file node (skip placeholder file)
          if (file.name === ".emptyFolderPlaceholder") break;
          current.push(file);
        } else {
          // Folder token: get or create folder node
          const folder = getFolder(current, token, tokens.slice(0, i + 1));
          current = folder.children;
        }
      }
    }

    return result;
  }

  export function generatePaths(segments: string[]): vfs.PathTokens[] {
    return segments.map((_, i) => segments.slice(0, i + 1));
  }
}
