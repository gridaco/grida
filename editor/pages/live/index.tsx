import React from "react";
import Pusher from "pusher-js";
import { useState } from "react";
import { useEffect } from "react";

const _base_url =
  "https://ahzdf5x4q3.execute-api.us-west-1.amazonaws.com/production"; // "https://assistant-live-session.grida.cc";

const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY, {
  // 'live-session-from-assistant'
  cluster: "us3",
  authEndpoint: _base_url + "/pusher/auth",
});

export default function LiveSessionPage() {
  // const [channel, setChannel] = useState<string>();
  const [lastmessage, setLastmessage] = useState<string>();

  useEffect(() => {
    // TODO: - add auth guard

    // subscribe once wheb the page is loaded
    const subscription = pusher.subscribe("private-live-session"); // channel
    subscription.bind("client-select", (d) => {
      setLastmessage(JSON.stringify(d));
    });
  }, []);

  return (
    <div style={{ margin: 24 }}>
      {lastmessage ? (
        <>
          <p>{lastmessage}</p>
        </>
      ) : (
        <>
          <p>No session connection</p>
        </>
      )}
    </div>
  );
}
