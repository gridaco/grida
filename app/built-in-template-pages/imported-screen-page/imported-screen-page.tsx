import { UnconstrainedTemplate } from "@boring.so/template-provider";
import { BoringContent, BoringTitle } from "@boring.so/document-model";
import { DesignProvider } from "@design-sdk/core-types";
import { nodes } from "@design-sdk/core";

interface PlatformCode {
  raw: string;
}

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
  code: {
    flutter?: PlatformCode;
    react?: PlatformCode;
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
  {{#with code.flutter}}
    {{raw}}
  {{/with}}
  </code></pre>

  <pre><code>
  {{#with code.react}}
    {{raw}}
  {{/with}}
  </code></pre>
  `,
      },
    });
  }
}
