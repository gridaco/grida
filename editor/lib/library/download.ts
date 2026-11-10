import { saveAs } from "file-saver";

/** Browser downloads for public Library pages, where cross-origin fetch is allowed. */
export namespace LibraryDownload {
  export async function save(href: string): Promise<void> {
    const filename = new URL(href).pathname.split("/").pop() || "library-image";
    const response = await fetch(href, { credentials: "omit" });
    if (!response.ok) throw new Error("Couldn't load Library image");
    // Pass the original Blob, not a remote URL or a re-encoded image. FileSaver
    // owns the temporary object URL and retains it until after the save click.
    saveAs(await response.blob(), filename, { autoBom: false });
  }
}
