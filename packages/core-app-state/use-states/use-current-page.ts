import { useState, useEffect } from "react";
import { PageStore } from "@core/store";
import { useApplicationState } from "../application-state";
import { Page } from "@core/model";

export function useCurrentPage() {
  const [page, setPage] = useState<Page>();
  const [app] = useApplicationState();
  const _pageid = app.selectedPage;

  useEffect(() => {
    if (_pageid.startsWith("built-in")) {
      setPage({
        id: _pageid,
        name: undefined,
        document: undefined,
        sort: 0, // fixme
        type: "boring-document",
      });
    } else {
      new PageStore().get(_pageid).then((p) => {
        setPage(p);
      });
    }
  }, [app]);

  return page;
}

export function useCurrentPageId() {
  const [page, setPage] = useState<string>();
  const [app] = useApplicationState();

  useEffect(() => {
    setPage(app.selectedPage);
  }, [app.selectedPage]);

  return page;
}
