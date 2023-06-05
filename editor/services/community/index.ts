import Axios from "axios";
import {
  FigmaCommunityFileQueryParams,
  FigmaCommunityFileMeta,
} from "ssg/community";

const client = Axios.create({
  baseURL: "/api/community",
});

export async function query(p: FigmaCommunityFileQueryParams) {
  return await client.get<ReadonlyArray<Partial<FigmaCommunityFileMeta>>>(
    "/files",
    {
      params: {
        origin: "figma",
        ...p,
      },
    }
  );
}
