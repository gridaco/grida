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
