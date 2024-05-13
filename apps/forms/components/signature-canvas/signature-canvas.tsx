"use client";

import { useEffect, useRef } from "react";
import SignaturePad from "signature_pad";
import { useDarkMode } from "usehooks-ts";
import { Card } from "../ui/card";

export function SignatureCanvas({ name }: React.ComponentProps<"input">) {
  const { isDarkMode } = useDarkMode();
  const ref = useRef<HTMLCanvasElement>(null);
  const pad = useRef<SignaturePad | null>(null);
  const hidden = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!ref.current) {
      return;
    }

    pad.current = new SignaturePad(ref.current, {
      penColor: isDarkMode ? "#fff" : "#000",
    });

    return () => {
      pad.current?.off();
    };
  }, [ref]);

  // change pen color
  useEffect(() => {
    if (!pad.current) {
      return;
    }
    // TODO: changing the pen color won't change the drawn color
    pad.current.penColor = isDarkMode ? "#fff" : "#000";
  }, [isDarkMode]);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
      }}
    >
      <Card className="w-min">
        <canvas ref={ref} width="auto" height={180} />
        <input type="hidden" ref={hidden} name={name} />
      </Card>
    </div>
  );
}
