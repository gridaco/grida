"use client";

import MessageAppFrame from "@/components/frames/message-app-frame";

export default function MessageFramePage() {
  return (
    <main className="w-screen h-screen">
      <div className="w-full h-full">
        <MessageAppFrame
          sender={{
            name: "John Doe",
            avatar: "JD",
            phone: "+1 234 567 890",
          }}
          messages={[
            {
              message: "Hello, how are you?",
              role: "incoming",
            },
            {
              // long message
              message:
                "Lorem ipsum dolor sit amet consectetur adipisicing elit. Quisquam, quos.",
              role: "outgoing",
            },
          ]}
          className="w-full h-full"
        />
      </div>
    </main>
  );
}
