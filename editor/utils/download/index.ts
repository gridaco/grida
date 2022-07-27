export function downloadFile({
  data,
  filename,
}: {
  data: string;
  filename: string;
}) {
  var blob = new Blob([data], { type: "text/txt" });
  var csvURL = window.URL.createObjectURL(blob);
  const tempLink = document.createElement("a");
  tempLink.href = csvURL;
  tempLink.setAttribute("download", filename);
  tempLink.click();
  tempLink.remove();
}
