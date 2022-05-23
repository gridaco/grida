export interface Post {
  id: string;
  title: string;
  displayTitle?: string;
  summary?: string;
  thumbnail?: string;
  author?: any; // TODO:
  body: any;
  isDraft: boolean;
  tags?: string[];
  scheduledAt?: string | Date;
  postedAt?: string | Date;
  createdAt?: string | Date;
  lastEditAt?: string | Date;
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

export type PublicationHost = {
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

/**
 * keep this name readable
 * this is used to build user message
 * > "There are currently no {t} posts in this publication.""
 *
 * > NOTE: this is a client-only type
 */
export type PostStatusType = "draft" | "scheduled" | "published" | "unlisted";
