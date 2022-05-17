import Axios, { AxiosInstance } from "axios";

export class PostsClient {
  private _client: AxiosInstance;

  constructor(readonly publicationId: string) {
    this._client = Axios.create({
      baseURL: "https://posts.grida.cc",
    });
  }

  async publication(id?: string) {
    id = id ?? this.publicationId;
    return await (
      await this._client.get(`/publications/${id}`)
    ).data;
  }

  async get(id: string) {
    return await (
      await this._client.get(`${id}`)
    ).data;
  }

  async posts() {
    return await (
      await this._client.get("/", {
        params: {
          publication: this.publicationId,
        },
      })
    ).data;
  }

  async draft({
    title,
    visibility,
  }: {
    title?: string | undefined;
    visibility?: "public" | "private";
  }) {
    return await (
      await this._client.post("/drafts", {
        publication: this.publicationId,
        title: title ?? "",
        visibility,
      })
    ).data;
  }

  async drafts() {
    await (
      await this._client.get("/drafts")
    ).data;
  }

  async publish(id: string) {
    return await (
      await this._client.post(`/${id}/publish`)
    ).data;
  }

  async unlist(id: string) {
    await (
      await this._client.post(`/${id}/unlist`)
    ).data;
  }

  async schedule(id: string) {
    await (
      await this._client.post(`/${id}/schedule`)
    ).data;
  }

  async scheduled() {
    await (
      await this._client.get("/scheduled")
    ).data;
  }

  async updateBody(id: string, html: string) {
    await (
      await this._client.put(`/${id}/body`, {
        html,
      })
    ).data;
  }

  async updateBodyCustom(id: string) {
    await (
      await this._client.put("/")
    ).data;
  }

  async updateTitle(id: string, title: string) {
    await (
      await this._client.post(`/${id}/title`, {
        title,
      })
    ).data;
  }

  async updateSummary(
    id: string,
    { summary, title }: { summary?: string; title?: string }
  ) {
    await (
      await this._client.post(`/${id}/summary`, {
        summary,
        title,
      })
    ).data;
  }

  async updateTags(id: string) {
    await (
      await this._client.put(`/${id}/tags`)
    ).data;
  }

  async updateVisibility(id: string, visibility: string) {
    return await (
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

  async uploadAsset(id, asset) {
    return await (
      await this._client.post(`/assets/${id}/upload`, {
        // visibility,
      })
    ).data;
  }

  async makeAssetClient(id) {
    return await (
      await this._client.post(`/assets/${id}/client`, {
        // visibility,
      })
    ).data;
  }
}
