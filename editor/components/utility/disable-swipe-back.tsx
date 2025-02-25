import React, { useEffect } from "react";

export const DisableSwipeBack = ({ children }: React.PropsWithChildren<{}>) => {
  useEffect(() => {
    document.body.style.overscrollBehaviorX = "none";

    return () => {
      document.body.style.overscrollBehaviorX = "";
    };
  }, []);

  return <>{children}</>;
};
