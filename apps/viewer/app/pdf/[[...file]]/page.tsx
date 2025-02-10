import { redirect } from "next/navigation";
import PDFViewer from "./viewer";

type PdfViewerApp = "" | "page-flip";

type Params = Promise<{ file: string[] | undefined }>;
type SearchParams = Promise<{
  url?: string | undefined;
  app?: PdfViewerApp | undefined;
}>;

export default async function PDFViewerPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { file: _p_file } = await params;
  const { url: _q_file, app = "" } = await searchParams;

  const file = (_q_file || _p_file?.[0])!;

  if (!file) {
    redirect("/");
  }

  return <PDFViewer app={app} file={file} />;
}
