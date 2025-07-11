/**
 * @see https://github.com/gridaco/puppeteer-666
 */
export function checkP666(): Promise<boolean> {
  return fetch("http://localhost:666", {
    method: "GET",
  })
    .then(() => {
      return true;
    })
    .catch(() => {
      return false;
    });
}

class P666Error extends Error {
  constructor(message: string) {
    super(message);
    this.name = "P666Error";
  }
}

/**
 * @see https://github.com/gridaco/puppeteer-666
 */
export async function exportWithP666(
  node_id: string,
  format: "PNG" | "PDF"
): Promise<Blob> {
  const daemonok = await checkP666();
  if (!daemonok) {
    throw new P666Error(
      "Daemon is not running on port 666. @see https://github.com/gridaco/puppeteer-666"
    );
  }

  const domnode = document.getElementById(node_id);
  const html = domnode!.outerHTML;

  let requrl = "";
  switch (format) {
    case "PDF":
      requrl = "http://localhost:666/api/pdf";
      break;
    case "PNG":
      requrl = "http://localhost:666/api/screenshoot";
      break;
  }

  // this will return pdf/png file (if the daemon is running)
  const task = fetch(requrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      html,
      options: {
        width: domnode!.clientWidth,
        height: domnode!.clientHeight,
      },
    }),
  }).then((res) => {
    return res.blob();
  });

  return task;
}
