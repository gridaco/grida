interface EmailTemplate {
  subject: string;
  html: string;
}

export function organization_onboarding_welcome_email({
  organization_name,
  owner_name,
}: {
  organization_name: string;
  owner_name: string;
}) {
  return {
    fromEmail: "Universe <universe@grida.co>",
    scheduledAt: "in 30 min",
    subject: "Welcome to Grida",
    text: `Hey ${owner_name},

I saw you just finished setting things up — that's awesome.
I'm Universe, the founder of Grida. I built this to help teams like yours move faster without wrestling with forms or clunky tools.

If anything felt confusing, slow, or just "meh", I'd love to hear. Seriously — just hit reply. It goes straight to me.

Thanks again for trying it out.

– Universe
CEO, Grida
`,
  };
}
