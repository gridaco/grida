import {
  FigmaCommunityArchiveMetaRepository,
  FigmaCommunityFileQueryParams,
} from "ssg/community";

type SearchParams = FigmaCommunityFileQueryParams & {
  origin: "figma";
};

export default async function handler(req, res) {
  const {
    origin,
    page: q_page,
    limit: q_limit,
    q,
    tag,
  } = req.query as SearchParams;

  // default values
  const page = parseInt(q_page as any as string) || 1;
  const limit = parseInt(q_limit as any as string) || 100;

  switch (origin) {
    case "figma": {
      const service = new FigmaCommunityArchiveMetaRepository();
      const results = service.q({ page, limit, q, tag });
      res.status(200).json(results);
      return;
    }
    default: {
      res.status(404).json({ message: "Not found" });
      return;
    }
  }
}
