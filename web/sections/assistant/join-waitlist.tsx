import React from "react";
import { FeaturedCard } from "./featured-card";

export function JoinWaitlistSection() {
  return (
    <div
      id="join-the-waitlist"
      style={{
        display: "flex",
        padding: "40px",
        justifyContent: "center",
      }}
    >
      <FeaturedCard>
        <h1>Join the waitlist</h1>
        <p>
          AI Powered Assistant is available to invited users at this moment.
          Join our waitlist for the full access.
        </p>
        <div style={{ marginTop: 24 }}>
          <a href="https://forms.gle/82jRrbopnSBLDw568">
            <button className="primary">Join the waitlist</button>
          </a>
        </div>
      </FeaturedCard>
    </div>
  );
}
