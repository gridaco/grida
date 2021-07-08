import { UnconstrainedTemplate } from "@boring.so/template-provider";
import { BoringContent, BoringTitle } from "@boring.so/document-model";
import { DesignProvider } from "@design-sdk/url-analysis";
import { nodes } from "@design-sdk/core";

interface ImportedScreenConfig {
  /**
   * source url
   */
  name: string;
  design: {
    id: string;
    url: string;
    source: DesignProvider;
    node: nodes.ReflectSceneNode;
  };
}

export class ImportedScreenTemplate extends UnconstrainedTemplate<ImportedScreenConfig> {
  constructor(p: { screen: ImportedScreenConfig }) {
    super({
      templateProps: {
        props: p.screen,
      },
      templateTitleSource: {
        default: new BoringTitle({
          icon: "📱",
          name: `New screen`,
        }).raw,
        template: new BoringTitle({
          icon: "📱",
          name: `(Screen) {{name}}`,
        }).raw,
      },
      templateContentSource: {
        default: "",
        template: `
  <screen-preview-card-block url="{{design.url}}"></screen-preview-card-block>
  
  <pre><code>
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
  `,
      },
    });
  }
}
