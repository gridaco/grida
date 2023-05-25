import fs from "fs";
import path from "path";

export type FigmaCommunityFileId = string;
export type FigmaCommunityPublisherId = string;

export interface FigmaCommunityFileMeta {
  id: FigmaCommunityFileId;
  name: string;
  description: string;
  version_id: string;
  version: string;
  created_at: string;
  duplicate_count: number;
  like_count: number;
  thumbnail_url: string;
  community_publishers: FigmaCommunityPublisherId[];
  publisher: {
    id: FigmaCommunityPublisherId;
    name: string;
    img_url: string;
    badges: ReadonlyArray<"figma_partner" | unknown>;
    primary_user_id: string;
    profile_handle: string;
    follower_count: number;
    following_count: number;
  };
  support_contact: string;
  creator: {
    id: string;
    handle: string;
    img_url: string;
  };
  tags: string[];
  related_content: {
    content: FigmaCommunityFileId[];
    type: "by_creator" | "by_remixes";
  };
}

export interface FigmaCommunityFileRelatedContentMeta {
  id: FigmaCommunityFileId;
  name: string;
  thumbnail_url: string;
  creator: {
    id: string;
    handle: string;
    img_url: string;
  };
  like_count: number;
  duplicate_count: number;
}

function read_meta_file(): ReadonlyArray<FigmaCommunityFileMeta> {
  // read meta.json from data/figma-archives/meta.json
  const meta = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "../data/figma-archives/prod/meta.json"),
      "utf-8"
    )
  );

  return meta;
}

function shorten_description(description: string, length: number = 64) {
  // 1. parse & remove html tags
  const plain = description.replace(/<[^>]*>?/gm, "");
  // 2. shorten to length
  // 3. add ... if needed
  return plain.slice(0, length) + "...";
}

export class FigmaArchiveMetaFile {
  readonly meta: any;

  constructor() {
    this.meta = read_meta_file();
  }

  find(id: string): FigmaCommunityFileMeta {
    return this.meta.find((file) => file.id === id);
  }

  page(
    page: number = 1,
    limit: number = 100,
    shorten: boolean = true
  ): ReadonlyArray<FigmaCommunityFileMeta> {
    const start = page * limit;
    const end = start + limit;
    return this.meta.slice(start, end).map((meta) => ({
      ...meta,
      description: shorten
        ? shorten_description(meta.description)
        : meta.description,
    }));
  }

  all() {
    return this.meta;
  }

  tags(): ReadonlyArray<string> {
    // set of all tags
    const tags = new Set<string>();
    this.meta.forEach((meta) => {
      meta.tags.forEach((tag) => tags.add(tag));
    });

    return Array.from(tags);
  }

  query_tag(tag: string) {
    return this.meta.filter((meta) => meta.tags.includes(tag));
  }

  getStaticProps(id: string) {
    const meta = this.find(id);

    const {
      name,
      description,
      version_id,
      version,
      created_at,
      duplicate_count,
      like_count,
      thumbnail_url,
      publisher,
      support_contact,
      creator,
      tags,
      related_content,
    } = meta;

    // const s3_base = `https://figma-community-files.s3.us-west-1.amazonaws.com`;
    // const s3_file = `${s3_base}/${id}/file.json`;

    // const { data: filedata } = await Axios.get(s3_file);
    const related_contents = related_content.content
      .map((id) => this.find(id))
      .filter(Boolean)
      .map((meta) => {
        const {
          id,
          name,
          thumbnail_url,
          creator,
          like_count,
          duplicate_count,
        } = meta;

        return {
          id,
          name,
          thumbnail_url,
          creator,
          like_count,
          duplicate_count,
        };
      });

    return {
      id,
      name,
      description,
      version_id,
      version,
      created_at,
      duplicate_count,
      like_count,
      thumbnail_url,
      publisher,
      support_contact,
      creator,
      tags,
      related_contents,
    };
  }
}
