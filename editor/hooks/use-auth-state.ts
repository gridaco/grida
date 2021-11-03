import { useAuthState as useGridaAuthState } from "@base-sdk-fp/auth-components-react";
import { useEffect, useState } from "react";

export function useAuthState() {
  const [authState, setAuthState] = useState<any>();
  const gridaauthstate = useGridaAuthState();

  useEffect(() => {
    setAuthState(gridaauthstate);
  }, [gridaauthstate]);

  return authState;
}
