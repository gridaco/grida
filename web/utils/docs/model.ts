export interface DocsPost {
  content?;
  date?;
  slug?;
  route: string[];
}

export interface DocsConfig {
  files: string[];
  routes: string[];
  routesWithoutIndex: string[];
}

// from manifest.json
export interface DocsRoute {
  title: string;
  path: string;
  open?: boolean;
  routes?: DocsRoute[];
}

export type DocsManifest = { routes: DocsRoute[] }[];
