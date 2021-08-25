const SIGNIN_URI = "https://accounts.grida.co/signin";

export function redirectionSignin(state) {
  const currentUri = window.location.href;
  const replaceUri = `${SIGNIN_URI}?redirect_uri=${currentUri}` as string;

  switch (state) {
    case "loading":
    case "signedin":
      return;
    case "expired":
    case "unauthorized":
      window.location.href = replaceUri;
      return;
  }
}
