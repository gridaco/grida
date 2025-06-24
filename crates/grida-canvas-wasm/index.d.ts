export default function GridaCanvasInit(
  opts?: GridaCanvasInitOptions
): Promise<GridaCanvas>;

export interface GridaCanvasInitOptions {
  /**
   * This callback will be invoked when the loader needs to fetch a file (e.g.
   * the blob of WASM code). The correct url prefix should be applied.
   * @param file - the name of the file that is about to be loaded.
   */
  locateFile(file: string): string;
}

export interface GridaCanvas {}
