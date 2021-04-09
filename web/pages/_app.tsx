import React from "react";
import { Suspense, StrictMode } from "react";
import App from "components/app";
import { RecoilRoot } from "recoil";

// enable SPA mode, supports react.Suspense; if you don't want to use Suspense, you can use NextJS' dynamic import instead. - on SSR mode
// though, this app does not benefit from SSR.
function SafeHydrate({ children }) {
  return (
    <div suppressHydrationWarning>
      {typeof window === "undefined" ? null : children}
    </div>
  );
}

function BridgedRootWebApp() {
  return (
    <SafeHydrate>
      <StrictMode>
        <Suspense fallback="Loading...">
          <RecoilRoot>
            <App />
          </RecoilRoot>
        </Suspense>
      </StrictMode>
    </SafeHydrate>
  );
}

export default BridgedRootWebApp;
