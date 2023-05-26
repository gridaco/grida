import { useState, useEffect } from "react";
import { query as api } from "services/community";
import {
  FigmaCommunityFileMeta,
  FigmaCommunityFileQueryParams,
} from "ssg/community";

export function useCommunityFiles({
  initial,
  max = false,
}: {
  max?: number | false;
  initial: {
    query: FigmaCommunityFileQueryParams;
    files?: ReadonlyArray<Partial<FigmaCommunityFileMeta>>;
  };
}) {
  const [query, setQuery] = useState<FigmaCommunityFileQueryParams>(
    initial.query
  );
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [files, setFiles] = useState<
    ReadonlyArray<Partial<FigmaCommunityFileMeta>>
  >(initial.files || null);

  const update = {
    loadMore: () => {
      setLoading(true);
      setQuery({
        ...query,
        page: query.page + 1,
      });
    },
    query: (q: Partial<FigmaCommunityFileQueryParams>) => {
      setQuery({
        ...query,
        ...q,
      });
    },
  };

  useEffect(() => {
    if (query.page === initial.query.page) return;
    api(query)
      .then(({ data }) => {
        const size = data.length;
        const all = [...files, ...data];
        // remove duplicates with id
        const unique = all.filter(
          (v, i, a) => a.findIndex((t) => t.id === v.id) === i
        );
        setFiles(unique);

        if (size === 0 || (max && unique.length >= max)) {
          setHasMore(false);
        }
      })
      .catch((err) => {})
      .finally(() => {
        setLoading(false);
      });
  }, [query.page]);

  const data = {
    query,
    files,
    loading,
    hasMore,
  };

  return [data, update] as const;
}
