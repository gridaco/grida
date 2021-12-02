import axios from "axios";

export async function getAnonymousFigmaAccessTokenOneshot(p: {
  code: string;
  state: string;
}) {
  const res = await axios.post<{
    figmaUserId: string;
    expiresAt: Date;
    accessToken: string;
  }>(
    "https://accounts.services.grida.co/anonymous-accounts/figma-anonymous/code-callback",
    p,
  );
  return res.data;
}

export async function startAnonymousFigmaAccessTokenOneshot() {
  const res = await axios.post<{
    url: string;
    state: string;
  }>(
    "https://accounts.services.grida.co/anonymous-accounts/figma-anonymous/start",
    {
      callbackTo: "grida.co/figma-instant-auth-callback",
    },
  );

  return res.data;
}
