"use client";

import React, { useEffect, useState } from "react";

export function digit2(digit: number) {
  return digit.toString().padStart(2, "0");
}

export function Timer({
  date,
  render,
}: {
  date: string | Date;
  render: ({
    ready,
    d,
    h,
    m,
    s,
  }: {
    ready: boolean;
    d: number;
    h: number;
    m: number;
    s: number;
  }) => React.ReactNode;
}) {
  const [remaining, setRemaining] = useState<number>(-1);

  const ready = remaining >= 0;

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining(new Date(date).getTime() - new Date().getTime());
    }, 1000);
    return () => clearInterval(interval);
  }, [date]);

  const remainingSeconds = Math.max(remaining / 1000, 0); // Ensure non-negative time
  const d = Math.floor(remainingSeconds / 86400);
  const h = Math.floor((remainingSeconds % 86400) / 3600);
  const m = Math.floor((remainingSeconds % 3600) / 60);
  const s = Math.floor(remainingSeconds % 60);

  return render({ ready, d, h, m, s });
}
