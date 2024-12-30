import React from "react";

type GoogleFontsV2Response = {
  [key: string]: {
    family: string;
    weights: number[];
    styles: string[];
  };
};

export function useGoogleFontsList() {
  const [fonts, setFonts] = React.useState<any[]>([]);
  React.useEffect(() => {
    fetch(
      "https://s3.us-west-1.amazonaws.com/google.fonts/google-fonts-v2.min.json"
    )
      .then((r) => r.json() as Promise<GoogleFontsV2Response>)
      .then((d) => {
        d && setFonts(Object.values(d));
      });
  }, []);

  return fonts;
}
