"use client";

import { useState } from "react";
import { ComposerDrafts } from "@/lib/agent-chat/composer-drafts";
import { AgentComposerInput } from "@/scaffolds/desktop/shared/agent-composer-input";
import { demoVoiceHost } from "./demo-voice";

const catalog = { commands: [], mentions: [] };

export function DictateDemo() {
  return (
    <div className="space-y-4">
      <DictateExample id="dictate-empty" label="Empty draft" />
      <DictateExample
        id="dictate-existing"
        label="Existing draft"
        initialText="Turn these notes into a presentation for the team."
      />
    </div>
  );
}

function DictateExample({
  id,
  label,
  initialText,
}: {
  id: string;
  label: string;
  initialText?: string;
}) {
  const [store] = useState(() => {
    const drafts = new ComposerDrafts(null, null);
    if (initialText) {
      drafts.write(id, {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: initialText }],
          },
        ],
      });
    }
    return drafts;
  });
  const [submitted, setSubmitted] = useState("");

  return (
    <section aria-labelledby={id} className="space-y-2">
      <h3 id={id} className="text-sm font-medium">
        {label}
      </h3>
      <AgentComposerInput
        catalog={catalog}
        draft={{ key: id, store }}
        isStreaming={false}
        onSubmit={setSubmitted}
        onStop={() => {}}
        voiceDictation={demoVoiceHost}
      />
      {submitted && (
        <output className="block text-sm whitespace-pre-wrap text-muted-foreground">
          Sent in preview{"\n"}
          {submitted}
        </output>
      )}
    </section>
  );
}
