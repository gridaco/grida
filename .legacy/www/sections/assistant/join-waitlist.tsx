import React, { useEffect } from "react";
import { FeaturedCard } from "./featured-card";
import Link from "next/link";
import { ArrowRightIcon } from "@radix-ui/react-icons";
import day from "dayjs";
import RelativeTime from "dayjs/plugin/relativeTime";
import styled from "@emotion/styled";
import { links } from "k/links";

day.extend(RelativeTime);

// get the first day of the next 2 weeks friday
const list_close_at = day()
  .day(5)
  .add(2, "week")
  .hour(0)
  .minute(0)
  .second(0)
  .millisecond(0);

export function JoinWaitlistSection() {
  const [closein, setClosein] = React.useState<string>(list_close_at.fromNow());

  useEffect(() => {
    const interval = setInterval(() => {
      // x days x hours x minutes x seconds

      // get the time difference between now and the list close time
      const diff = list_close_at.diff(day(), "second");

      const isPast = diff < 0;

      if (isPast) {
        // set the state
        setClosein(undefined);
      } else {
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
      }
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
        {closein && (
          <TickerText>
            <span className="text">The list will close in </span>
            <span className="time">{closein}</span>
          </TickerText>
        )}
        <h1>Join the waitlist</h1>
        <p>
          AI Powered Assistant is available to invited users at this moment.
          Join our waitlist for the full access.
        </p>
        <div className="cta" style={{ marginTop: 24 }}>
          <Link href="https://forms.gle/82jRrbopnSBLDw568">
            <button className="primary">Join the waitlist</button>
          </Link>
          <Link href={links.book_a_demo}>
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
