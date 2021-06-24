import React from "react";
import { Scaffold as BoringScaffold } from "@boringso/react-core";
import { extensions } from "../../app-blocks";

export function ImportedScreenPageTemplate() {
  const initialContent = `
<h1>this is imported screen</h1>

<screen-preview-card-block url=""></screen-preview-card-block>

<pre><code>
import React from "react";
import { Scaffold as BoringScaffold } from "@boringso/react-core";
import { extensions } from "../../app-blocks";

export function ImportedScreenPageTemplate() {
  const initialTitle = \`New screen\`;
  return (
    """<BoringScaffold
      extensions={extensions}
      initialTitle={initialTitle}
      initialContent={initialContent}
    />"""
  );
}
</code></pre>

`;
  const initialTitle = `New screen`;
  return (
    <BoringScaffold
      extensions={extensions}
      initialTitle={initialTitle}
      initialContent={initialContent}
    />
  );
}
