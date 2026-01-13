export namespace TemplateData {
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
