import { NextRequest, NextResponse } from "next/server";
import { removeBackgroundImage } from "../actions";
import type { RemoveBackgroundImageActionInput } from "../actions";
import ai from "@/lib/ai";

export type RemoveBackgroundImageApiRequestBody =
  RemoveBackgroundImageActionInput;

export type RemoveBackgroundImageApiResponse = {
  data: ai.server.methods.BackgroundRemoverResult;
};

export async function POST(req: NextRequest) {
  const body = (await req.json()) as RemoveBackgroundImageApiRequestBody;

  // Call the server action - it handles validation, auth, rate limiting, and business logic
  const result = await removeBackgroundImage(body);

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
  } satisfies RemoveBackgroundImageApiResponse);
}
