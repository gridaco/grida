import { useCallback, useEffect, useRef, useState } from "react";

type EyeDropper = {
  open(): Promise<EyeDropperResult>;
};

type EyeDropperResult = {
  /**
   * A string representing the selected color, in hexadecimal sRGB format (#aabbcc).
   * @see https://developer.mozilla.org/en-US/docs/Web/API/EyeDropper/open
   */
  sRGBHex: string;
};

export function useEyeDropper() {
  const [isSupported, setIsSupported] = useState(false);
  const dropper = useRef<EyeDropper | null>(null);
  useEffect(() => {
    if (!window.EyeDropper) {
      setIsSupported(false);
      return;
    }
    setIsSupported(true);
    const eyeDropper = new window.EyeDropper();
    dropper.current = eyeDropper;
  }, []);

  const open = useCallback(() => {
    return dropper.current?.open();
  }, []);

  return { isSupported, open };
}
