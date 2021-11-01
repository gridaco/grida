import React from "react";
import Pusher from "pusher-js";
import { useState } from "react";

const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY, {});

export default function LiveSessionPage() {
  const [channel, setChannel] = useState<string>();
  const [lastmessage, setLastmessage] = useState<string>();

  const connect = () => {
    pusher.channel(channel);
  };

  return (
    <div style={{ margin: 24 }}>
      <input
        placeholder="channel"
        onChange={(e) => {
          setChannel(e.target.value);
        }}
      />
      <button disabled={!!!channel} onClick={connect}>
        connect
      </button>
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
