import React from "react";
import { FeaturedCard } from "./featured-card";
import Link from "next/link";
import { ArrowRightIcon } from "@radix-ui/react-icons";

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
        <div className="cta" style={{ marginTop: 24 }}>
          <Link href="https://forms.gle/82jRrbopnSBLDw568">
            <button className="primary">Join the waitlist</button>
          </Link>
          <Link href="https://calendly.com/universe-at-grida/meet-grida">
            <button>
              Book a Demo
              <ArrowRightIcon />
            </button>
          </Link>
        </div>
      </FeaturedCard>
    </div>
  );
}
