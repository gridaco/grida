import { NextRequest, NextResponse } from "next/server";
import { upscaleImage } from "../actions";
import type { UpscaleImageActionInput } from "../actions";
import ai from "@/lib/ai";

export type UpscaleImageApiRequestBody = UpscaleImageActionInput;

export type UpscaleImageApiResponse = {
  data: ai.server.methods.RealEsrganResult;
};

export async function POST(req: NextRequest) {
  const body = (await req.json()) as UpscaleImageApiRequestBody;

  // Call the server action - it handles validation, auth, rate limiting, and business logic
  const result = await upscaleImage(body);

  // Convert server action response to API response format
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
  } satisfies UpscaleImageApiResponse);
}
