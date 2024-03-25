"use client";

import { useEffect, useRef } from "react";
import SignaturePad from "signature_pad";

export function SignatureCanvas({ name }: React.ComponentProps<"input">) {
  const ref = useRef<HTMLCanvasElement>(null);
  const pad = useRef<SignaturePad | null>(null);
  const hidden = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!ref.current) {
      return;
    }

    pad.current = new SignaturePad(ref.current);

    return () => {
      pad.current?.off();
    };
  }, [ref]);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
      }}
    >
      <canvas
        className="bg-transparent border rounded border-black shadow"
        ref={ref}
        width="auto"
        height={180}
      />
      <input type="hidden" ref={hidden} name={name} />
    </div>
  );
}
