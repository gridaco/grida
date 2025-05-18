interface EmailTemplate {
  subject: string;
  html: string;
}

interface Templates {
  [key: string]: EmailTemplate;
}

export const TEMPLATES: Templates = {
  organization_onboarding_welcome_email: {
    subject: "Welcome to Grida",
    html: `
      <p>Hey {first_name},</p>

      <p>I saw you just finished setting things up — that's awesome.</p>

      <p>I'm Universe, the founder of Grida. I built this to help teams like yours move faster without wrestling with forms or clunky tools.</p>

      <p>If anything felt confusing, slow, or just "meh", I'd love to hear. Seriously — just hit reply. It goes straight to me.</p>

      <p>Thanks again for trying it out.</p>

      <p>– Universe<br>
      CEO, Grida</p>
    `,
  },
};
