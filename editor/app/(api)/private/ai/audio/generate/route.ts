import { NextRequest, NextResponse } from "next/server";
import { generateAudio } from "../actions";
import type {
  GenerateAudioActionInput,
  GenerateAudioActionResult,
} from "../actions";

export type GenerateAudioApiRequestBody = GenerateAudioActionInput;

export type GenerateAudioApiResponse = {
  data: GenerateAudioActionResult["data"];
};

export async function POST(req: NextRequest) {
  let body: GenerateAudioApiRequestBody;
  try {
    body = (await req.json()) as GenerateAudioApiRequestBody;
  } catch {
    return NextResponse.json({ message: "invalid json" }, { status: 400 });
  }

  const result = await generateAudio(body);

  if (!result.success) {
    const errorResponse: {
      message: string;
      limit?: number;
      reset?: number;
      remaining?: number;
    } = {
      message: result.message,
    };
    if (result.limit !== undefined) {
      errorResponse.limit = result.limit;
      errorResponse.reset = result.reset;
      errorResponse.remaining = result.remaining;
    }
    return NextResponse.json(errorResponse, { status: result.status });
  }

  return NextResponse.json({
    data: result.data,
  } satisfies GenerateAudioApiResponse);
}
