export function makeurl__connect_figma(): string {
  const _host =
    process.env.NODE_ENV !== "production"
      ? "http://localhost:3302"
      : "https://accounts.grida.co";
  const url = `${_host}/tunnel?command=connect-figma`;
  return url;
}
