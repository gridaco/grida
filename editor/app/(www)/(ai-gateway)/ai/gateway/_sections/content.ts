// Example requests shown on the page. Keep them valid against the living
// contract: https://gateway.grida.ai/llms.txt

export const CREATIVE_CODE = `const job = await fetch("https://gateway.grida.ai/v1/videos", {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${process.env.GRIDA_GATEWAY_API_KEY}\`,
    "Content-Type": "application/json",
    "Idempotency-Key": crypto.randomUUID(),
  },
  body: JSON.stringify({
    model: "alibaba/wan-3.0",
    prompt: "A slow orbit around a red ceramic teapot",
  }),
}).then((res) => res.json());

// then poll GET /v1/jobs/{job.id}`;

export const OPENAI_CODE = `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://gateway.grida.ai/v1",
  apiKey: process.env.GRIDA_GATEWAY_API_KEY,
});

const completion = await client.chat.completions.create({
  model: "openai/gpt-5.5",
  messages: [{ role: "user", content: "Say hello in one sentence." }],
});`;
