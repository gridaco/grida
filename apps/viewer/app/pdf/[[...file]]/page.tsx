import { redirect } from "next/navigation";
import PDFViewer from "./viewer";
import { Metadata } from "next";

const FIRST_PARTY_BASE_STORAGE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL + "/storage/v1";

type PdfViewerApp = "" | "page-flip";

type Params = { file: string[] | undefined };
type _Params = Promise<Params>;
type SearchParams = {
  url?: string | undefined;
  object?: string | undefined;
  app?: PdfViewerApp | undefined;
  title?: string | undefined;
  favicon?: string | undefined;
  logo?: string | undefined;
};
type _SearchParams = Promise<SearchParams>;

type Props = {
  params: _Params;
  searchParams: _SearchParams;
};

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

export async function generateMetadata({
  params,
  searchParams,
}: Props): Promise<Metadata> {
  const p = {
    ...(await params),
    ...(await searchParams),
  };

  const title = p.title;

  return {
    title: title,
  };
}

export default async function PDFViewerPage({ params, searchParams }: Props) {
  const p = {
    ...(await params),
    ...(await searchParams),
  };
  const app = p.app || "";
  const title = p.title;
  const file = get_file_path(p);

  if (!file) {
    redirect("/");
  }

  return <PDFViewer app={app} file={file} title={title} />;
}
