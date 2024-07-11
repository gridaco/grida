import { Inconsolata, Inter, Lora } from "next/font/google";

const inter = Inter({ subsets: ["latin"], display: "swap" });
const lora = Lora({ subsets: ["latin"], display: "swap" });
const inconsolata = Inconsolata({ subsets: ["latin"], display: "swap" });

export const fonts = {
  inter,
  lora,
  inconsolata,
};
