import React from "react";
import data from "@/backgrounds";
import { notFound } from "next/navigation";
export default function BackgroundViewPage({
  params,
}: {
  params: {
    name: string;
  };
}) {
  const name = params.name;
  const bg = data.find((bg) => bg.name === name);

  if (!bg) {
    return notFound();
  }

  return (
    <main>
      <header className="m-10 p-10 bg-white/50 text-black backdrop-blur-2xl border rounded-md shadow w-min space-y-4">
        <h1 className="text-2xl font-bold">{bg.title}</h1>
        <p className="font-mono">{bg.name}</p>
        <div className="text-xs py-4 max-w-md overflow-scroll bg-black text-white px-2">
          <pre>{embedstr(bg.embed)}</pre>
        </div>
      </header>
      <iframe
        src={bg.embed}
        className="fixed inset-0 w-full h-full -z-10 pointer-events-none"
        frameBorder="0"
        allowFullScreen
        title={name}
      />
    </main>
  );
}

function embedstr(embed: string) {
  return `<iframe src="${embed}" class="fixed inset-0 w-full h-full -z-10 pointer-events-none" frameBorder="0"></iframe>`;
}
