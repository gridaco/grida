import Axios from "axios";

const _HOST =
  process.env.NODE_ENV == "production"
    ? "https://accounts.services.grida.co"
    : "http://localhost:9002";

const axios = Axios.create({
  baseURL: _HOST + "/anonymous-accounts/figma-anonymous",
});

export const _FIGMA_ACCESS_TOKEN_STORAGE_KEY = "figma-access-token";

export async function getAnonymousFigmaAccessTokenOneshot(p: {
  code: string;
  state: string;
}) {
  const res = await axios.post<{
    figmaUserId: string;
    expiresAt: Date;
    accessToken: string;
  }>(
    // ${_HOST}/anonymous-accounts/figma-anonymous/code-callback
    `code-callback`,
    p,
  );
  return res.data;
}

export async function startAnonymousFigmaAccessTokenOneshot() {
  const res = await axios.post<{
    url: string;
    state: string;
  }>(
    // ${_HOST}/anonymous-accounts/figma-anonymous/start
    `start`,
    {
      callbackTo: "grida.co/figma-instant-auth-callback",
    },
  );

  return res.data;
}

export function saveFigmaAccessToken__localstorage(p: {
  expiresAt: Date;
  accessToken: string;
}) {
  window.localStorage.setItem(
    _FIGMA_ACCESS_TOKEN_STORAGE_KEY,
    JSON.stringify(p),
  );
}

export function getFigmaAccessToken__localstorage(): {
  expiresAt: Date;
  accessToken: string;
} | null {
  try {
    const p = window.localStorage.getItem(_FIGMA_ACCESS_TOKEN_STORAGE_KEY);
    if (!p) return null;
    const existing = JSON.parse(p);
    if (new Date(existing.expiresAt) < new Date()) return null;
    return existing;
  } catch (e) {
    return null;
  }
}
