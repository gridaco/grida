import data from "@/backgrounds";
import { NextResponse } from "next/server";

const HOST = "https://bg.grida.co";

export function GET() {
  const data_w_full_url = data.map((bg) => ({
    ...bg,
    preview: bg.preview.map((url) => `${HOST}${url}`),
    embed: `${HOST}${bg.embed}`,
    url: `${HOST}${bg.url}`,
  }));
  return NextResponse.json(data_w_full_url);
}
