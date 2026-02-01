export namespace TemplateData {
  export type PaletteKey = keyof typeof import("@/theme/palettes").default;

  export interface West_Referrral__Duo_001 {
    template_id: "grida_west_referral.duo-000";
    locale: "en" | "ko";
    theme?: {
      navbar?: {
        logo?: {
          src: string;
          srcDark?: string;
        };
      };
      /**
       * Styles overrides for campaign pages (non-expert settings).
       * This is persisted inside `grida_www.template.data` per campaign template.
       */
      styles?: {
        /**
         * Base palette preset key (saved string; must match keys in `theme/palettes`).
         * If omitted, campaign pages use the default app theme.
         */
        palette?: PaletteKey;
        /**
         * Override for `--radius` (e.g. `"0.75rem"` or `"12px"`).
         */
        radius?: string;
      };
    };
    components: {
      referrer?: {
        image?: {
          type: "image";
          src: string;
        };
        title?: string;
        cta?: string;
        description?: string;
        /**
         * Controls whether the invite list section is visible on the referrer page.
         */
        show_invitations?: boolean;
        invitation_card_content?: {
          type: "richtext";
          html: string;
        };
        article?: {
          type: "richtext";
          html: string;
        };
      };
      "referrer-share"?: {
        article?: {
          type: "richtext";
          html: string;
        };
        consent?: string;
        cta?: string;
      };
      "referrer-share-message"?: {
        message?: string;
      };
      ["invitation-ux-overlay"]?: {
        image?: {
          type: "image";
          src: string;
        };
      };
      invitation?: {
        image?: {
          type: "image";
          src: string;
        };
        cta?: string;
        title?: string;
        description?: string;
        invitation_card_content?: {
          type: "richtext";
          html: string;
        };
        article?: {
          type: "richtext";
          html: string;
        };
      };
    };
  }
}
