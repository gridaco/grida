import PDFViewer from "./viewer";

type PdfViewerApp = "" | "page-flip";

type Params = Promise<{ file: string[] | undefined }>;
type SearchParams = Promise<{
  file?: string | undefined;
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
  const { file: _q_file, app = "" } = await searchParams;

  const file = (_p_file?.[0] || _q_file)!;

  return <PDFViewer app={app} file={file} />;
}
