"use server";

import { createApi } from "unsplash-js";
import type { Basic as _PhotoBasic } from "unsplash-js/dist/methods/photos/types";

type UnsplashPhoto = _PhotoBasic & {
  /**
   * if the photo is from Unsplash+, it will be true - this should be filtered out
   */
  plus: boolean;
  /**
   * if the photo is premium, it will be true - this should be filtered out
   */
  premium: boolean;
};

export type PhotoAsset = {
  id: string;
  alt: string;
  description?: string;
  width: number;
  height: number;
  color?: string;
  blurHash?: string;
  premium?: boolean;
  plus?: boolean;
  urls: {
    raw: string;
    full: string;
    regular: string;
    small: string;
    thumb: string;
  };
  link: string;
  author: {
    name: string;
    username: string;
    profileUrl: string;
    avatar?: string;
  };
};

export type PhotoSearchResult = {
  query: string;
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
  results: PhotoAsset[];
};

export type PhotoTopic = {
  id: string;
  slug: string;
  title: string;
  description?: string;
  coverUrl?: string;
};

export type PhotoActionState = {
  status: "idle" | "ok" | "error";
  mode: "search" | "random" | "topic";
  query: string;
  results: PhotoAsset[];
  total?: number;
  totalPages?: number;
  message?: string;
};

type SearchOptions = {
  query: string;
  page?: number;
  perPage?: number;
  orientation?: "landscape" | "portrait" | "squarish";
};

type RandomOptions = {
  count?: number;
  orientation?: "landscape" | "portrait" | "squarish";
};

type TopicPhotosOptions = {
  topicSlug: string;
  page?: number;
  perPage?: number;
  orientation?: "landscape" | "portrait" | "squarish";
};

let clientCache: ReturnType<typeof createApi> | null = null;

const getClient = () => {
  if (clientCache) return clientCache;
  const apiKey =
    process.env.UNSPLASH_API_KEY || process.env.UNSPLASH_ACCESS_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing UNSPLASH_API_KEY (or UNSPLASH_ACCESS_KEY) environment variable."
    );
  }
  clientCache = createApi({
    accessKey: apiKey,
    fetch: (...args) => fetch(...args),
  });
  return clientCache;
};

const normalizePhoto = (photo: _PhotoBasic | UnsplashPhoto): PhotoAsset => {
  return {
    id: photo.id,
    alt: photo.alt_description || photo.description || "Untitled photo",
    description: photo.description || undefined,
    width: photo.width,
    height: photo.height,
    color: photo.color || undefined,
    blurHash: photo.blur_hash || undefined,
    premium: "premium" in photo ? photo.premium : false,
    plus: "plus" in photo ? photo.plus : false,
    urls: photo.urls,
    link: photo.links.html,
    author: {
      name: photo.user.name || photo.user.username,
      username: photo.user.username,
      profileUrl: photo.user.links.html,
      avatar:
        photo.user.profile_image.small ||
        photo.user.profile_image.medium ||
        photo.user.profile_image.large,
    },
  };
};

/**
 * Filters out premium (Unsplash+) photos, keeping only free photos
 */
const filterFreePhotos = (photos: PhotoAsset[]): PhotoAsset[] => {
  return photos.filter((photo) => !photo.premium && !photo.plus);
};

async function getRandomPhotos(
  options: RandomOptions = {}
): Promise<PhotoAsset[]> {
  const { count = 12, orientation } = options;
  const res = await getClient().photos.getRandom({
    count,
    orientation,
  });
  if (res.errors?.length) {
    throw new Error(res.errors.join(", "));
  }
  if (!res.response) {
    throw new Error("No response from Unsplash random photos API.");
  }
  const payload = Array.isArray(res.response) ? res.response : [res.response];
  const normalized = payload.map(normalizePhoto);
  return filterFreePhotos(normalized);
}

async function getTopicPhotos({
  topicSlug,
  page = 1,
  perPage = 20,
  orientation,
}: TopicPhotosOptions): Promise<PhotoSearchResult> {
  if (!topicSlug) {
    throw new Error("Topic slug is required to fetch topic photos.");
  }

  const res = await getClient().topics.getPhotos({
    topicIdOrSlug: topicSlug,
    page,
    perPage,
    orientation,
  });
  if (res.errors?.length) {
    throw new Error(res.errors.join(", "));
  }
  if (!res.response) {
    throw new Error("No response from Unsplash topic photos API.");
  }

  console.log("res.response", res.response.results);

  const normalized = res.response.results.map(normalizePhoto);
  const freeResults = filterFreePhotos(normalized);

  // Use the actual API total, but note that after filtering premium photos,
  // the actual available results may be less. We'll use the API total as an estimate.
  const apiTotal = res.response.total ?? 0;
  // Calculate totalPages from total and perPage (API may not provide total_pages directly)
  const apiTotalPages = Math.ceil(apiTotal / perPage);

  return {
    query: topicSlug,
    page,
    perPage,
    total: apiTotal,
    totalPages: apiTotalPages,
    results: freeResults,
  };
}

async function searchPhotos({
  query,
  page = 1,
  perPage = 20,
  orientation,
}: SearchOptions): Promise<PhotoSearchResult> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    throw new Error("Search query cannot be empty.");
  }

  const res = await getClient().search.getPhotos({
    query: trimmedQuery,
    page,
    perPage,
    orientation,
  });
  if (res.errors?.length) {
    throw new Error(res.errors.join(", "));
  }
  if (!res.response) {
    throw new Error("No response from Unsplash search API.");
  }

  const normalized = res.response.results.map(normalizePhoto);
  const freeResults = filterFreePhotos(normalized);

  // Use the actual API total, but note that after filtering premium photos,
  // the actual available results may be less. We'll use the API total as an estimate.
  const apiTotal = res.response.total ?? 0;
  // Calculate totalPages from total and perPage (API may not provide total_pages directly)
  const apiTotalPages = Math.ceil(apiTotal / perPage);

  return {
    query: trimmedQuery,
    page,
    perPage,
    total: apiTotal,
    totalPages: apiTotalPages,
    results: freeResults,
  };
}

export async function fetchPhotoTopics(): Promise<PhotoTopic[]> {
  const res = await getClient().topics.list({
    orderBy: "oldest",
  });
  if (res.errors?.length) {
    throw new Error(res.errors.join(", "));
  }
  if (!res.response) {
    throw new Error("No response from Unsplash topics API.");
  }
  return res.response.results.map((topic) => ({
    id: topic.id,
    slug: topic.slug,
    title: topic.title,
    description: topic.description || undefined,
    coverUrl: topic.cover_photo?.urls.thumb,
  }));
}

export async function fetchPhotosAction({
  mode,
  query,
  perPage = 18,
  topicSlug,
  page = 1,
}: {
  mode: PhotoActionState["mode"];
  query: string;
  perPage?: number;
  topicSlug?: string;
  page?: number;
}): Promise<PhotoActionState> {
  const safeQuery = query?.trim() ?? "";
  try {
    if (mode === "random" || (!safeQuery && mode !== "topic")) {
      const results = await getRandomPhotos({ count: perPage || 18 });
      return {
        status: "ok",
        mode: "random",
        query: "",
        results,
        total: results.length,
        totalPages: 1,
        message: undefined,
      };
    }

    if (mode === "topic") {
      if (!topicSlug) {
        throw new Error("Topic slug is required for topic mode.");
      }
      const topicResult = await getTopicPhotos({
        topicSlug,
        page,
        perPage: perPage || 18,
      });
      return {
        status: "ok",
        mode: "topic",
        query: topicResult.query,
        results: topicResult.results,
        total: topicResult.total,
        totalPages: topicResult.totalPages,
        message: undefined,
      };
    }

    const searchResult = await searchPhotos({
      query: safeQuery,
      page,
      perPage: perPage || 18,
    });
    return {
      status: "ok",
      mode: "search",
      query: searchResult.query,
      results: searchResult.results,
      total: searchResult.total,
      totalPages: searchResult.totalPages,
      message: undefined,
    };
  } catch (e) {
    return {
      status: "error",
      mode,
      query: mode === "random" ? "" : safeQuery,
      results: [],
      total: 0,
      totalPages: 0,
      message:
        e instanceof Error ? e.message : "Failed to load photos from Unsplash.",
    };
  }
}
