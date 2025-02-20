import { createApi } from "unsplash-js";
import { NextResponse } from "next/server";
import { RandomPhoto } from "@/lib/unsplash";

const unsplash = createApi({
  accessKey: process.env.UNSPLASH_ACCESS_KEY!,
});

export async function GET() {
  const { response, errors } = await unsplash.photos.getRandom({ count: 20 });

  if (!response) {
    console.error(errors);
    return NextResponse.error();
  }

  const photos: RandomPhoto[] = response as RandomPhoto[];

  return NextResponse.json(photos);
}
