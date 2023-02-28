import React from "react";
import { FeaturedCard } from "./featured-card";

export function JoinWithCodeSection() {
  return (
    <div
      style={{
        display: "flex",
        padding: "40px",
        justifyContent: "center",
      }}
    >
      <FeaturedCard>
        <h2>
          Welcome to our
          <br />
          private beta program
        </h2>
        <p>
          From the Authenticator App, please enter your one-time-password to
          continue.
        </p>
        <button>Register</button>
      </FeaturedCard>
    </div>
  );
}
