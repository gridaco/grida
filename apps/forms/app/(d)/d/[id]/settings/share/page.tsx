import {
  PreferenceBody,
  PreferenceBox,
  PreferenceBoxHeader,
  Sector,
  SectorBlocks,
  SectorDescription,
  SectorHeader,
  SectorHeading,
} from "@/components/preferences";
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

  const { url, submit, embed } = data;

  return (
    <main className="max-w-2xl mx-auto">
      <Sector>
        <SectorHeader>
          <SectorHeading>Share the link</SectorHeading>
          <SectorDescription>
            We provide built-in agent URL, although you can build your own
            frontend agent.
          </SectorDescription>
        </SectorHeader>
        <SectorBlocks>
          <PreferenceBox>
            <PreferenceBoxHeader heading={<>Built-in Agent URL</>} />
            <PreferenceBody>
              <p>
                Share this link with your users to let them fill out the form.
                <br />
              </p>
              <pre className="overflow-x-scroll p-2 bg-neutral-50 rounded">
                <span className="underline opacity-70 text-sm">{url}</span>
              </pre>
            </PreferenceBody>
          </PreferenceBox>
          <PreferenceBox>
            <PreferenceBoxHeader heading={<>Embedding</>} />
            <PreferenceBody>
              <pre className="overflow-x-scroll p-2 bg-neutral-100 rounded">
                <span>{build_embed_code(embed)}</span>
              </pre>
            </PreferenceBody>
          </PreferenceBox>
        </SectorBlocks>
      </Sector>
      <Sector>
        <SectorHeader>
          <SectorHeading>Headless usage</SectorHeading>
          <SectorDescription>
            Using <code className="font-mono">/submit</code> api, you can start
            collecting forms without the need of backend
          </SectorDescription>
        </SectorHeader>
        <SectorBlocks>
          <PreferenceBox>
            <PreferenceBoxHeader heading={<>Quick Submit API URL</>} />
            <PreferenceBody>
              <p>
                Use this URL to action on your html form to collect data
                directly to the backend.
              </p>
              <pre className="overflow-x-scroll p-2 bg-neutral-50 rounded">
                <span className="underline opacity-70 text-sm">{submit}</span>
              </pre>
            </PreferenceBody>
          </PreferenceBox>
        </SectorBlocks>
      </Sector>
    </main>
  );
}

function build_embed_code(url: string) {
  return `<iframe src="${url}" width="100%" height="600px" frameBorder="0"></iframe>`;
}
