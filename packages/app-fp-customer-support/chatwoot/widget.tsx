///
/// https://www.chatwoot.com/docs/product/channels/live-chat/sdk/setup
///

import React from "react";
import "./types";

/**
 * https://www.chatwoot.com/docs/product/channels/live-chat/integrations/nextjs
 */
export class ChatwootWidget extends React.Component<{
  /**
   * rather to show chat bubble initially
   * @default true
   */
  show?: boolean;
}> {
  componentDidMount() {
    window.chatwootSettings = {
      hideMessageBubble: !this.props.show,
      position: "right",
      locale: "en",
    };

    (function (d, t) {
      var BASE_URL = "https://app.chatwoot.com";
      var g = d.createElement(t),
        s = d.getElementsByTagName(t)[0];
      // @ts-ignore
      g.src = BASE_URL + "/packs/js/sdk.js";
      s.parentNode.insertBefore(g, s);
      // @ts-ignore
      g.async = !0;
      g.onload = function () {
        window.chatwootSDK.run({
          // -- this CAN be public --
          websiteToken: "AKvuiCJsJcxbZ8odMm3wHYDH",
          // ------------------------
          baseUrl: BASE_URL,
        });
      };
    })(document, "script");
  }

  render() {
    return null;
  }
}
