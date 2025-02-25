import { UnconstrainedTemplate } from "@boring.so/template-provider";
import { BoringContent, BoringTitle } from "@boring.so/document-model";
import type { DesignProvider } from "@design-sdk/core-types";
import type { ReflectSceneNode } from "@design-sdk/figma-node";

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
    node: ReflectSceneNode;
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
  
  {{#with code.flutter}}
    <scaffold-code-block source="{{raw}}" lang="dart">
    </scaffold-code-block>
  {{/with}}

  {{#with code.react}}
    <scaffold-code-block source="{{raw}}" lang="ts">
    </scaffold-code-block>
  {{/with}}
  `,
      },
    });
  }
}
