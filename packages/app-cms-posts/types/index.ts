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
