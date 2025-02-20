import {
  useAuthState as useGridaAuthState,
  LoginState,
} from "@base-sdk-fp/auth-components-react";
import { useEffect, useState } from "react";

export function useAuthState() {
  const [authState, setAuthState] = useState<LoginState>();
  const gridaauthstate = useGridaAuthState();

  useEffect(() => {
    setAuthState(gridaauthstate);
  }, [gridaauthstate]);

  return authState;
}
