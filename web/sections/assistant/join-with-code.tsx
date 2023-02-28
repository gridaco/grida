import Link from "next/link";
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
        <p>Please enter the OTP from Google Authenticator app to continue.</p>
        <form
          style={{
            display: "flex",
            flexDirection: "row",
            gap: 8,
            marginTop: 24,
          }}
        >
          <input placeholder="000000" style={{ width: 140 }} />
          <button className="primary">Enter</button>
        </form>
        <div
          style={{
            marginTop: 80,
          }}
        >
          <Link href="/assistant">
            <a>Not a member yet?</a>
          </Link>
        </div>
      </FeaturedCard>
    </div>
  );
}
