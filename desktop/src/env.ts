export const IS_INSIDERS = INSIDERS === 1;
export const IS_DEV = process.env.NODE_ENV === "development";
export const EDITOR_BASE_URL =
  IS_INSIDERS || IS_DEV ? "http://localhost:3000" : "https://app.grida.co";
