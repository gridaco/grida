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
  const sections = tree.children.filter((block) => block.type === "section");

  const has_sections = sections.length > 0;

  const last_section_id = has_sections
    ? sections[sections.length - 1].id
    : null;
  const [current_section, set_current_section] = useState<string | null>(
    has_sections ? sections[0].id : null
  );

  const submit_hidden = has_sections
    ? last_section_id !== current_section
    : false;

  const previous_section_button_hidden = has_sections
    ? current_section === sections[0].id
    : true;

  const next_section_button_hidden = has_sections
    ? current_section === last_section_id
    : true;

  const onPrevious = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (current_section === sections[0].id) {
      return;
    }

    const index = sections.findIndex(
      (section) => section.id === current_section
    );
    set_current_section(sections[index - 1].id);
  };

  const onNext = (e: React.MouseEvent<HTMLButtonElement>) => {
    // validate current section
    e.preventDefault();
    e.stopPropagation();

    if (current_section === last_section_id) {
      return;
    }

    const index = sections.findIndex(
      (section) => section.id === current_section
    );
    set_current_section(sections[index + 1].id);
  };

  const renderBlock = (block: ClientRenderBlock): any => {
    switch (block.type) {
      case "section": {
        return (
          <section
            key={block.id}
            data-active-section={current_section === block.id}
            className="rounded data-[active-section='false']:hidden"
          >
            <GroupLayout>{block.children?.map(renderBlock)}</GroupLayout>
          </section>
        );
      }
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
      case "html": {
        return (
          <article
            key={block.id}
            dangerouslySetInnerHTML={{ __html: block.html }}
          />
        );
      }
      case "header": {
        return (
          <header key={block.id}>
            {block.title_html && (
              <h1
                dangerouslySetInnerHTML={{
                  __html: block.title_html,
                }}
              />
            )}
            {block.description_html && (
              <p
                dangerouslySetInnerHTML={{
                  __html: block.description_html,
                }}
              />
            )}
          </header>
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
      case "pdf": {
        return (
          <object
            key={block.id}
            data={block.data + "#toolbar=0&navpanes=0&scrollbar=0"}
            className="w-full h-full aspect-[1/1.2] max-h-screen rounded overflow-hidden border shadow-sm box-content"
            type="application/pdf"
            width="100%"
            height="100%"
          >
            <a href={block.data} target="_blank">
              {block.data}
            </a>
          </object>
        );
      }
      case "divider":
        return <hr key={block.id} />;
      default:
        return <div key={block["id"]}></div>;
    }
  };

  return (
    <main className="relative container mx-auto min-h-screen prose p-4 dark:prose-invert">
      {/* <header>
        <h1 className="py-10 text-4xl font-bold">{title}</h1>
      </header> */}
      <form
        id="form"
        action={"/submit/" + form_id}
        className="h-full overflow-auto flex-1"
      >
        <FingerprintField />
        <GroupLayout>{tree.children.map(renderBlock)}</GroupLayout>
      </form>
      <footer className="mt-4 flex gap-4">
        <button
          data-previous-hidden={previous_section_button_hidden}
          className="
              bg-neutral-100 text-black shadow
              rounded px-4 py-2
              data-[previous-hidden='true']:hidden
            "
          onClick={onPrevious}
        >
          Back
        </button>
        <button
          data-next-hidden={next_section_button_hidden}
          className="
            bg-neutral-100 text-black shadow
              rounded px-4 py-2
              data-[next-hidden='true']:hidden
            "
          onClick={onNext}
        >
          Next
        </button>
        <button
          data-submit-hidden={submit_hidden}
          form="form"
          className="
            bg-blue-500 text-white shadow
              rounded px-4 py-2
              data-[submit-hidden='true']:hidden
            "
          type="submit"
        >
          Submit
        </button>
      </footer>
      <Footer />
    </main>
  );
}

function GroupLayout({ children }: React.PropsWithChildren<{}>) {
  return <div className="flex flex-col gap-8">{children}</div>;
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
