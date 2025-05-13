import fs from "fs";
import path from "path";

type TMetaFileStage = "development" | "production";
const _staged_file_dir_map = {
  development: "dev",
  production: "prod",
} as const;

export type FigmaCommunityFileId = string;
export type FigmaCommunityPublisherId = string;

export type FigmaCommunityFileQueryParams = {
  sort?: "popular" | "latest"; // TODO: add trending
  q?: string;
  tag?: string;
} & PaginationParams;

interface PaginationParams {
  page?: number;
  limit?: number;
  skip?: number;
}

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

function read_meta_file(
  stage: TMetaFileStage
): ReadonlyArray<FigmaCommunityFileMeta> {
  // read meta.json from data/figma-archives/meta.json
  const meta = JSON.parse(
    fs.readFileSync(
      path.join(
        process.cwd(),
        `../data/figma-archives/${_staged_file_dir_map[stage]}/meta.json`
      ),
      "utf-8"
    )
  );

  return meta;
}

function shorten_description(description: string, length: number = 64) {
  if (!description) return null;
  // 1. parse & remove html tags
  const plain = description.replace(/<[^>]*>?/gm, "");
  // 2. shorten to length
  // 3. add ... if needed
  return plain.slice(0, length) + "...";
}

function minify(
  ...files: FigmaCommunityFileMeta[]
): ReadonlyArray<Partial<FigmaCommunityFileMeta>> {
  return files.map((meta) => {
    return {
      id: meta.id,
      name: meta.name,
      thumbnail_url: meta.thumbnail_url,
      duplicate_count: meta.duplicate_count,
      like_count: meta.like_count,
      publisher: meta.publisher,
    };
  }) as ReadonlyArray<Partial<FigmaCommunityFileMeta>>;
}

// cache meta file
let __meta: {
  data: ReadonlyArray<FigmaCommunityFileMeta>;
  stage: TMetaFileStage;
} = null;

export class FigmaCommunityArchiveMetaRepository {
  readonly meta: ReadonlyArray<FigmaCommunityFileMeta>;
  readonly stage: TMetaFileStage;
  constructor(stage: TMetaFileStage = null) {
    this.stage =
      stage ||
      (process.env.FIGMA_COMMUNITY_FILES_STAGE as any) ||
      "development";

    // load from cache or read from file
    if (!__meta || __meta.stage !== this.stage) {
      __meta = { data: read_meta_file(this.stage), stage: this.stage };
    }
    this.meta = __meta.data;
  }

  find(id: string): FigmaCommunityFileMeta {
    return this.meta.find((file) => file.id === id);
  }

  ids() {
    return this.meta.map((file) => file.id);
  }

  q({
    page = 1,
    limit = 100,
    skip = 0,
    q,
    tag,
    sort = "popular",
    shorten = true,
  }: FigmaCommunityFileQueryParams & {
    shorten?: boolean;
  }) {
    // if q is provided, search by q
    // if tag is provided, search by tag
    // do pagination

    // sorting
    const sort_by_popularity = (a, b) => {
      // 1. sort by like_count, if same, sort by duplicate_count
      if (a.like_count === b.like_count) {
        return b.duplicate_count - a.duplicate_count;
      }
      return b.like_count - a.like_count;
    };

    const sort_by_latest = (a, b) => {
      // 1. sort by created_at
      return (
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    };

    let sorting = sort_by_popularity;
    switch (sort) {
      case "latest":
        sorting = sort_by_latest;
        break;
      case "popular":
      default:
        sorting = sort_by_popularity;
    }
    //

    // pagination
    const start = (page - 1) * limit + (skip || 0);
    const end = start + limit;

    const pass = () => true;
    const results = this.meta
      // q (lowercase both)
      .filter(
        q
          ? (meta) =>
              meta.name.toLocaleLowerCase().includes(q.toLocaleLowerCase())
          : pass
      )
      // tag (lowercase only input - data is already lowercased)
      .filter(
        tag ? (meta) => meta.tags.includes(tag.toLocaleLowerCase()) : pass
      )
      // sort
      .sort(sorting)
      // pagination
      .slice(start, end);

    if (shorten) {
      return minify(...results);
    }
    return results;
  }

  page(
    page: number = 1,
    limit: number = 100,
    shorten: boolean = true
  ): ReadonlyArray<Partial<FigmaCommunityFileMeta>> {
    const start = (page - 1) * limit;
    const end = start + limit;
    if (shorten) {
      return minify(...this.meta.slice(start, end));
    }
    return this.meta.slice(start, end);
  }

  all(option?: { shorten?: boolean }) {
    if (option?.shorten) {
      return minify(...this.meta);
    }
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

  query_tag(tag: string): ReadonlyArray<Partial<FigmaCommunityFileMeta>> {
    const files = this.meta.filter((meta) => meta.tags.includes(tag));
    return minify(...files);
  }

  getProps(id: string) {
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
