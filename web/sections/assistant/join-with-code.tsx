import Link from "next/link";
import React from "react";
import { FeaturedCard } from "./featured-card";

export function JoinWithCodeSection() {
  const [verified, setVerified] = React.useState(false);

  return (
    <div
      id="start"
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
        {verified ? (
          <>
            <a href="https://docs.google.com/forms/d/e/1FAIpQLSfcv2k1oddtM30nCN7xCE_dAw41ZhagzBEAtEuVLuOXKziJlQ/viewform?usp=sf_link">
              <button className="primary">Start your subscription</button>
            </a>
          </>
        ) : (
          <>
            <p>Enter the OTP from Google Authenticator to continue.</p>
            <form
              onSubmit={e => {
                e.preventDefault();
                const totp = e.target["totp"].value;
                // TODO: add a server side check
                if (totp.length == 6) {
                  setVerified(true);
                }
              }}
              style={{
                display: "flex",
                flexDirection: "row",
                gap: 8,
                marginTop: 24,
              }}
            >
              <input
                id="totp"
                minLength={6}
                maxLength={6}
                placeholder="000000"
                style={{ width: 140 }}
              />
              <button className="primary">Enter</button>
            </form>
            <div
              style={{
                marginTop: 80,
              }}
            >
              <Link href="/assistant#join-the-waitlist">
                <a>Not Invited yet?</a>
              </Link>
            </div>
          </>
        )}
      </FeaturedCard>
    </div>
  );
}
