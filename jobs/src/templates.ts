export function organization_onboarding_welcome_email({
  owner_name,
}: {
  owner_name: string;
}) {
  return {
    fromEmail: "Universe <universe@grida.co>",
    scheduledAt: "in 30 min",
    subject: "Welcome to Grida",
    text: `Hey ${owner_name},

I saw you just finished setting things up — that's awesome.
I'm Universe, the founder of Grida. I built this to help teams like yours move faster without wrestling with forms or clunky tools.

Quick question — what's your primary goal with Grida?  
I’d love to hear. Just hit reply, it goes straight to me.

Also, feel free to join our Slack and chat with me directly (@universe): https://grida.co/join-slack

Thanks again for giving it a try.

– Universe  
CEO, Grida
`,
  };
}
