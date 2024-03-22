"use client";

import { ClientRenderBlock } from "@/app/(api)/v1/[id]/route";
import { FormFieldPreview } from "@/components/formfield";
import { Footer } from "./footer";
import { useEffect, useState } from "react";

export function Form({
  form_id,
  title,
  blocks,
}: {
  form_id: string;
  title: string;
  blocks: ClientRenderBlock[];
}) {
  const renderBlock = (block: ClientRenderBlock) => {
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
          // <label
          //   data-has-label={!!field.label}
          //   key={field.id}
          //   className="flex flex-col gap-1 data-[has-label='false']:capitalize"
          // >
          //   <span>{field.label || field.name}</span>
          //   <input
          //     name={field.name}
          //     className="shadow appearance-none border rounded py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
          //     min={field.min}
          //     max={field.max}
          //     pattern={field.pattern}
          //     required={field.required}
          //     minLength={field.minlength}
          //     maxLength={field.maxlength}
          //     placeholder={field.placeholder || field.label || field.name}
          //     type={field.type}
          //   />
          //   {field.help_text && (
          //     <span className="text-sm text-gray-500">{field.help_text}</span>
          //   )}
          // </label>
        );
      }
      case "section": {
        return <>Section</>;
      }
    }
  };

  return (
    <main className="p-4 container mx-auto min-h-screen">
      <header>
        <h1 className="py-10 text-4xl font-bold">{title}</h1>
      </header>
      <form
        action={"/submit/" + form_id}
        className="flex flex-col gap-8 py-4 h-full overflow-auto flex-1"
      >
        <FingerprintField />
        {blocks.map(renderBlock)}
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
