import Axios from "axios";
import { useEffect, useState } from "react";

// REGION NON PUBLIC API
export const AuthenticatedAxios = Axios.create({
  baseURL: "https://accounts.services.grida.co",
  withCredentials: true,
});
/**
 * simple verification that the browser instance is authenticated with cookie.
 */
async function __verifyBorwserAuth(): Promise<boolean> {
  try {
    return (await (await AuthenticatedAxios.get("/verify/browser-auth"))
      .data) as boolean;
  } catch (_) {
    if (_.response.status == 401) {
      return false;
    }
    throw _;
  }
}
// ENDREGION NON PUBLIC API

export type LoginState = "signedin" | "loading" | "expired" | "unauthorized";
export function useLoginState() {
  const [isLoggedIn, setIsLoggedIn] = useState<LoginState>("loading");

  useEffect(() => {
    __verifyBorwserAuth()
      .then(() => setIsLoggedIn("signedin"))
      .catch(() => setIsLoggedIn("unauthorized"))
      .finally();
  }, []);

  return isLoggedIn;
}
