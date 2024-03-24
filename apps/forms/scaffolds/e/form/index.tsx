"use client";

import { ClientRenderBlock } from "@/app/(api)/v1/[id]/route";
import { FormFieldPreview } from "@/components/formfield";
import { Footer } from "./footer";
import React, { useEffect, useState } from "react";
import { FormBlockTree } from "@/lib/forms/types";
import { FormFieldDefinition } from "@/types";
import dynamic from "next/dynamic";

const ReactPlayer = dynamic(() => import("react-player/lazy"), { ssr: false });

export function Form({
  form_id,
  title,
  blocks,
  fields,
  tree,
}: {
  form_id: string;
  title: string;
  fields: FormFieldDefinition[];
  blocks: ClientRenderBlock[];
  tree: FormBlockTree<ClientRenderBlock[]>;
}) {
  const renderBlock = (block: ClientRenderBlock): any => {
    switch (block.type) {
      case "field": {
        const { field } = block;
        return (
          <FormFieldPreview
            key={field.id}
            name={field.name}
            label={field.label}
            placeholder={field.placeholder}
            type={field.type}
            required={field.required}
            helpText={field.help_text}
            options={field.options}
            pattern={field.pattern}
          />
        );
      }
      case "section": {
        return (
          <section
            key={block.id}
            className="border border-gray-300 p-4 rounded"
          >
            <>{block.children?.map(renderBlock)}</>
          </section>
        );
      }
      case "html": {
        return (
          <article
            key={block.id}
            dangerouslySetInnerHTML={{ __html: block.html }}
          />
        );
      }
      case "image": {
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={block.id} src={block.src} alt="" />
        );
      }
      case "video": {
        return (
          <div
            key={block.id}
            className="bg-neutral-200 rounded overflow-hidden border border-black/20 aspect-video"
          >
            <ReactPlayer width={"100%"} height={"100%"} url={block.src ?? ""} />
          </div>
        );
      }
      case "divider":
        return <hr key={block.id} />;
      default:
        return <div key={block["id"]}></div>;
    }
  };

  return (
    <main className="p-4 container mx-auto min-h-screen prose">
      <header>
        <h1 className="py-10 text-4xl font-bold">{title}</h1>
      </header>
      <form
        action={"/submit/" + form_id}
        className="flex flex-col gap-8 py-4 h-full overflow-auto flex-1"
      >
        <FingerprintField />
        {tree.children.map(renderBlock)}
        <button className="bg-blue-500 text-white rounded p-2" type="submit">
          Submit
        </button>
      </form>
      <Footer />
    </main>
  );
}

function FingerprintField() {
  const [fingerprint, setFingerprint] = useState<string>("");

  useEffect(() => {
    setTimeout(() => {
      window.fingerprint?.get().then((f) => {
        setFingerprint(f.visitorId);
      });
    }, 1000);
  }, []);

  /* hidden client fingerprint field */
  return (
    <input
      type="hidden"
      name="__gf_fp_fingerprintjs_visitorid"
      value={fingerprint}
    />
  );
}
