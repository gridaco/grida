import {
  getAccessToken,
  oauth,
  FigmaAuthStore,
} from "@design-sdk/figma-auth-store";

// FigmaAuthStore
const prefix = "3rd-party-api/figma/";
FigmaAuthStore.configure({
  prefix: prefix,
});

export function getToken() {
  return getAccessToken();
}

export function setOauthToken(token: string) {
  oauth.set(token);
}
