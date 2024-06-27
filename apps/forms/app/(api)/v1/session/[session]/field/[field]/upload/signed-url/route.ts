import { session_storage_createSignedUploadUrl } from "@/services/form/storage";
import type {
  CreateSessionSignedUploadUrlRequest,
  FormsApiResponse,
  SessionSignedUploadUrlData,
} from "@/types/private/api";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  req: NextRequest,
  context: {
    params: {
      session: string;
      field: string;
    };
  }
) {
  const session_id = context.params.session;
  const field_id = context.params.field;

  const body = (await req.json()) as CreateSessionSignedUploadUrlRequest;

  const { file } = body;

  // TODO: validate if anonymous user is owner of this session
  // TODO: validate if session is open

  const { data, error } = await session_storage_createSignedUploadUrl({
    session_id: session_id,
    field_id: field_id,
    file: file,
    config: {},
  });

  return NextResponse.json(<FormsApiResponse<SessionSignedUploadUrlData>>{
    data: data,
    error: error,
  });
}

export async function PUT(
  req: NextRequest,
  context: {
    params: {
      session: string;
      field: string;
    };
  }
) {
  const session_id = context.params.session;
  const field_id = context.params.field;

  const body = (await req.json()) as CreateSessionSignedUploadUrlRequest;

  const { file } = body;

  // TODO: validate if anonymous user is owner of this session
  // TODO: validate if session is open

  const { data, error } = await session_storage_createSignedUploadUrl({
    session_id: session_id,
    field_id: field_id,
    file: file,
    config: {
      unique: true,
    },
  });

  if (error) {
    console.error("session/sign-upload-urls", error);
    return NextResponse.error();
  }

  return NextResponse.json(<FormsApiResponse<SessionSignedUploadUrlData>>{
    data: data,
    error: error,
  });
}
