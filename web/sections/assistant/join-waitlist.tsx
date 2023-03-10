import React, { useEffect } from "react";
import { FeaturedCard } from "./featured-card";
import Link from "next/link";
import { ArrowRightIcon } from "@radix-ui/react-icons";
import day from "dayjs";
import RelativeTime from "dayjs/plugin/relativeTime";
import styled from "@emotion/styled";

day.extend(RelativeTime);

const list_close_at = day("2023-03-15T00:00:00.000Z");

export function JoinWaitlistSection() {
  const [closein, setClosein] = React.useState<string>(list_close_at.fromNow());

  useEffect(() => {
    const interval = setInterval(() => {
      // x days x hours x minutes x seconds

      // get the time difference between now and the list close time
      const diff = list_close_at.diff(day(), "second");

      // format
      const days = Math.floor(diff / (3600 * 24));
      const hours = Math.floor((diff % (3600 * 24)) / 3600);
      const minutes = Math.floor((diff % 3600) / 60);
      const seconds = Math.floor(diff % 60);

      // set the state
      setClosein(
        `${
          days > 0 ? `${days} days ` : ""
        }${hours} hours ${minutes} minutes and ${seconds} seconds`,
      );
    }, 1000);
    return () => clearInterval(interval);
  }, []);

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
        <TickerText>
          <span className="text">The list will close in </span>
          <span className="time">{closein}</span>
        </TickerText>
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

const TickerText = styled.h3`
  font-size: 14px;
  font-family: "Helvetica Neue", sans-serif;
  line-height: 95%;

  opacity: 0.4;

  .text {
    font-weight: 500;
  }

  .time {
    font-weight: 600;
  }
`;
