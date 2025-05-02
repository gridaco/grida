export namespace Library {
  export type Object = {
    alt: string | null;
    author_id: string | null;
    background: string | null;
    bytes: number;
    categories: unknown[];
    category: string;
    color: string | null;
    colors: unknown[];
    created_at: string;
    description: string | null;
    entropy: number | null;
    fill: string | null;
    generator: string | null;
    gravity_x: number | null;
    gravity_y: number | null;
    height: number;
    id: string;
    keywords: string[];
    lang: string | null;
    license: string;
    mimetype: string;
    objects: string[];
    orientation: "portrait" | "landscape" | "square" | null;
    path: string;
    path_tokens: string[] | null;
    prompt: string | null;
    public_domain: boolean;
    score: number | null;
    search_tsv: unknown | null;
    sys_annotations: string[];
    title: string | null;
    transparency: boolean;
    updated_at: string;
    version: number;
    width: number;
    year: number | null;
  };

  export type Author = {
    id: string;
    user_id: string | null;
    avatar_url: string | null;
    blog: string | null;
    created_at: string;
    name: string;
    provider: string | null;
    updated_at: string;
    username: string;
  };

  export type Category = {
    id: string;
    name: string;
    created_at: string;
    description: string | null;
  };
}
