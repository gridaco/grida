"use client";

import { useState } from "react";

export default function ImagePlayground() {
  const [loading, setLoading] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [imageSrc, setImageSrc] = useState<string | null>(null);

  const generate = async () => {
    setLoading(true);
    const r = await fetch(`/private/ai/generate/image`, {
      body: JSON.stringify({
        model: {
          provider: "replicate",
          modelId: "recraft-ai/recraft-v3",
        },
        width: 1024,
        height: 1024,
        prompt,
      }),
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    }).then((res) => res.json());
    setLoading(false);
    setImageSrc(r.data.publicUrl);
  };
  return (
    <main>
      {loading && <p>Loading...</p>}
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Enter your prompt here"
      />
      <button onClick={generate}>Generate Image</button>
      {imageSrc && <img src={imageSrc} alt="Generated" />}
    </main>
  );
}
