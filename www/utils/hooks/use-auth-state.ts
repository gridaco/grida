import {
  LoginState,
  useAuthState as _useAuthState,
} from "@base-sdk-fp/auth-components-react";
import { useEffect, useState } from "react";

/**
 * useAuthState wrapper. set mock-authentication to true on localstorage to mock auth state.
 * @returns
 */
export function useAuthState() {
  const [authState, setAuthState] = useState<LoginState>("loading");
  const _authState = _useAuthState();
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      try {
        setAuthState(
          JSON.parse(window.localStorage.getItem("mock-authentication"))
            ? "signedin"
            : "unauthorized",
        );
      } catch (e) {
        setAuthState("unauthorized");
      }
    } else {
      setAuthState(_authState);
    }
  }, [_authState]);

  return authState;
}
