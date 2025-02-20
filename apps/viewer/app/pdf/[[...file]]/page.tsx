import { redirect } from "next/navigation";
import PDFViewer from "./viewer";

const FIRST_PARTY_BASE_STORAGE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL + "/storage/v1";

type PdfViewerApp = "" | "page-flip";

type Params = { file: string[] | undefined };
type _Params = Promise<Params>;
type SearchParams = {
  url?: string | undefined;
  object?: string | undefined;
  app?: PdfViewerApp | undefined;
};
type _SearchParams = Promise<SearchParams>;

function get_file_path(params: SearchParams & Params): string | undefined {
  const { file: _p_file, url: _q_url, object: _q_object } = params;

  if (_q_object) {
    return `${FIRST_PARTY_BASE_STORAGE_URL}/${_q_object}`;
  }

  if (_q_url) {
    return _q_url;
  }

  return _p_file?.[0];
}

export default async function PDFViewerPage({
  params,
  searchParams,
}: {
  params: _Params;
  searchParams: _SearchParams;
}) {
  const p = {
    ...(await params),
    ...(await searchParams),
  };
  const app = p.app || "";
  const file = get_file_path(p);

  if (!file) {
    redirect("/");
  }

  return <PDFViewer app={app} file={file} />;
}
