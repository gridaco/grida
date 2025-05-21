import Axios, { AxiosInstance } from "axios";
import type { Post, Publication } from "../types";
import assert from "assert";

export class PostsClient {
  private _client: AxiosInstance;

  constructor(readonly publicationId: string) {
    this._client = Axios.create({
      baseURL: "https://posts.grida.cc",
    });
  }

  async publication(id?: string): Promise<Publication> {
    id = id ?? this.publicationId;
    return (await this._client.get(`/publications/${id}`)).data;
  }

  async get(id: string): Promise<Post> {
    return (await this._client.get(`${id}`)).data;
  }

  async posts() {
    return (
      await this._client.get("/", {
        params: {
          publication: this.publicationId,
        },
      })
    ).data;
  }

  async draft({
    title,
    visibility = "public",
  }: {
    title?: string | undefined;
    visibility?: "public" | "private";
  }) {
    const body = {
      publication: this.publicationId,
      title: title ?? "",
      visibility,
    };

    return (await this._client.post("/drafts", body)).data;
  }

  async drafts() {
    return (await this._client.get("/drafts")).data;
  }

  async publish(id: string) {
    return (await this._client.post(`/${id}/publish`)).data;
  }

  async unlist(id: string) {
    return (await this._client.post(`/${id}/unlist`)).data;
  }

  async schedule(id: string) {
    return (await this._client.post(`/${id}/schedule`)).data;
  }

  async scheduled() {
    return (await this._client.get("/scheduled")).data;
  }

  async updateBody(id: string, html: string) {
    return (
      await this._client.put(`/${id}/body`, {
        html,
      })
    ).data;
  }

  async updateBodyCustom(id: string) {
    return (await this._client.put("/")).data;
  }

  async updateTitle(id: string, title: string) {
    return (
      await this._client.post(`/${id}/title`, {
        title,
      })
    ).data;
  }

  async updateSummary(
    id: string,
    { summary, title }: { summary?: string; title?: string }
  ) {
    return (
      await this._client.post(`/${id}/summary`, {
        summary,
        title,
      })
    ).data;
  }

  async updateTags(id: string, tags: string[]): Promise<{ tags: string[] }> {
    return (
      await this._client.put(`/${id}/tags`, {
        tags,
      })
    ).data;
  }

  async updateVisibility(id: string, visibility: string) {
    return (
      await this._client.put(`/${id}/tags`, {
        visibility,
      })
    ).data;
  }

  async putThumbnail(
    id: string,
    thumbnail: string | File
  ): Promise<{
    thumbnail: string;
  }> {
    const route = `/${id}/thumbnail`;
    if (typeof thumbnail === "string") {
      return (
        await this._client.put(route, {
          thumbnail,
        })
      ).data;
    }

    if (thumbnail instanceof File) {
      const form = new FormData();
      form.append("thumbnail", thumbnail);
      return (await this._client.put(route, form)).data;
    }
  }

  // assets

  async uploadAsset(
    postid: string,
    ...assets: File[]
  ): Promise<{
    post_id: string;
    assets: { [originalname: string]: string };
  }> {
    const form = new FormData();

    assets.forEach((a) => {
      form.append("files", a);
    });

    return (await this._client.post(`/assets/${postid}/upload`, form)).data;
  }

  /**
   * returns a presigned s3 upload url for payload size bigger than 6mb.
   */
  async makeOneTimeAssetClient(
    postid: string,
    file: File
  ): Promise<AssetOneTimeUploadClientMakeResult> {
    assert(postid, "postid is required");
    return (
      await this._client.post(`/assets/${postid}/client/one-time`, {
        originalname: file.name,
        mimetype: file.type,
      })
    ).data;
  }

  async deletePost(id) {
    return (await this._client.delete(`/${id}`)).data;
  }
}

type AssetOneTimeUploadClientMakeResult = {
  client: {
    /**
     * the client url make a put request here
     */
    url: string;
    expires_in: number;
    expires_at: string | Date;
    mimetype: string;
    originalname: string;
    path: string;
  };
  /**
   * a asset url
   */
  url: string;
};
