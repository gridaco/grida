export interface Post {
  id: string;
  title: string;
  summary?: string;
  thumbnail?: string;
  author?: any; // TODO:
  body: any;
  isDraft: boolean;
  tags?: string[];
  scheduledAt?: string | Date;
  postedAt?: string | Date;
  readingTime?: number;
}

export interface Publication {
  id: string;
  name: string;
  workspace: string;
  hosts?: PublicationHost[];
  logo?: string;
  cover?: string;
  slug: string;
  createdAt: Date;
}

type PublicationHost = {
  /**
   * e.g https://blog.grida.co/posts
   */
  homepage: string;
  /**
   * e.g /[id] - https://blog.grida.co/posts/[id]
   * @default "/[id]"
   */
  pattern: string;
};
