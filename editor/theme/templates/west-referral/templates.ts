export namespace TemplateData {
  export interface West_Referrral__Duo_001 {
    template_id: "grida_west_referral.duo-000";
    theme: {
      navbar: {
        logo: {
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
        article?: {
          type: "richtext";
          html: string;
        };
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
        article?: {
          type: "richtext";
          html: string;
        };
      };
    };
  }
}
