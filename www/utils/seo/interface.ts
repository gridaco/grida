export interface PageSeoMeta {
  route: string;
  title: string;
  description: string;
  og?: OpenGraphMeta;
  keywords: string[] | string;
  author?: string;
}

export interface OpenGraphMeta {
  title: string;
  type?: string | "website";
  url?: string;
  image: string;
}
