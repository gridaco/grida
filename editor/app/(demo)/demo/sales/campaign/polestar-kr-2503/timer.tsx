import React from "react";
import { useTimer } from "react-timer-hook";

function getNextKSTMidnight() {
  const now = new Date();
  const nowKST = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Seoul" })
  );
  const nextMidnightKST = new Date(nowKST);
  nextMidnightKST.setDate(nowKST.getDate() + 1);
  nextMidnightKST.setHours(0, 0, 0, 0);
  const diff = nextMidnightKST.getTime() - nowKST.getTime();
  return new Date(now.getTime() + diff);
}

export function CountdownTimer() {
  const expiryTimestamp = getNextKSTMidnight();
  const { hours, minutes, seconds } = useTimer({
    expiryTimestamp,
    onExpire: () => console.warn("Timer expired"),
  });

  return (
    <div className="text-orange-500 flex flex-col justify-center space-y-4 w-full text-center">
      <hr className="border-orange-500" />
      <div className="text-2xl font-medium">
        {hours}h : {minutes}m : {seconds}s
      </div>
      <hr className="border-orange-500" />
    </div>
  );
}
