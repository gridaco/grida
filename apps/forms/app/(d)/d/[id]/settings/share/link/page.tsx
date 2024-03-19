import React from "react";

const HOST = process.env.HOST;

async function getData(id: string) {
  const res = await fetch(`${HOST}/v1/${id}/share`);
  // The return value is *not* serialized
  // You can return Date, Map, Set, etc.

  if (!res.ok) {
    // This will activate the closest `error.js` Error Boundary
    throw new Error("Failed to fetch data");
  }

  return res.json();
}

export default async function WithLink({ params }: { params: { id: string } }) {
  const { id } = params;
  const data = await getData(id);

  const { url } = data;

  return (
    <main className="w-full">
      <h1 className="text-xl font-bold">Use Link</h1>
      <p>
        Share this link with your users to let them fill out the form.
        <br />
      </p>
      <pre className="overflow-x-scroll p-2 bg-neutral-100 rounded">
        <span className="underline">{url}</span>
      </pre>
    </main>
  );
}
