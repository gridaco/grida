import { response_file_upload_storage_presigned_url } from "@/services/form/session-storage";
import { NextRequest, NextResponse } from "next/server";

interface CreateSessionSignedUploadUrlRequest {
  file: {
    name: string;
    size: number;
  };
}

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

  const { data, error } = await response_file_upload_storage_presigned_url(
    {
      field_id: field_id,
      session_id: session_id,
    },
    file.name
  );

  return NextResponse.json({
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

  const { data, error } = await response_file_upload_storage_presigned_url(
    {
      field_id: field_id,
      session_id: session_id,
    },
    file.name,
    // replace = true
    true
  );

  return NextResponse.json({
    data: data,
    error: error,
  });
}
