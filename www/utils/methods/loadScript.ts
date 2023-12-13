export async function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const scriptTag = document.createElement("script");
    scriptTag.src = src;
    scriptTag.async = true;
    scriptTag.defer = true;
    scriptTag.onload = () => {
      resolve();
    };
    scriptTag.onerror = () => {
      reject();
    };
    document.body.appendChild(scriptTag);
  });
}
