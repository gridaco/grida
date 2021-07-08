import { UnconstrainedTemplate } from "@boring.so/template-provider";
import { BoringContent, BoringTitle } from "@boring.so/document-model";

interface ImportedScreenConfig {
  /**
   * design provider
   */
  provider: string;
  /**
   * source url
   */
  source: string;
}

export class ImportedScreenTemplate extends UnconstrainedTemplate<ImportedScreenConfig> {
  title = new BoringTitle({
    icon: "📱",
    name: `New screen`,
  });
  content = new BoringContent(`
  <screen-preview-card-block url=""></screen-preview-card-block>
  
  <pre><code>
  import React from "react";
  import { Scaffold as BoringScaffold } from "@boringso/react-core";
  import { extensions } from "../../app-blocks";
  
  export function ImportedScreenPageTemplate() {
    const initialTitle = \`New screen\`;
    return (
      <BoringScaffold
        extensions={extensions}
        initialTitle={initialTitle}
        initialContent={initialContent}
      />
    );
  }
  </code></pre>
  `);
}
