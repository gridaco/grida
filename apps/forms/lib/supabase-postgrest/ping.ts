export function ping({ url, key }: { url: string; key: string }) {
  return fetch(url, {
    headers: {
      apikey: key,
    },
  });
}
