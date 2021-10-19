import { useRouter } from "next/router";
import React from "react";

// this page is not used
// this page is redirected by next.conf.js
// below code is obsolete

export default function() {
  // temporary redirection
  const router = useRouter();
  if (typeof window !== "undefined") {
    router.push("/docs/getting-started");
  }
  return (
    <div style={{ textAlign: "center", margin: 120 }}>
      <h1>Welcome to Grida Docs</h1>
      <h2>You are now being redirected</h2>
    </div>
  );
}
