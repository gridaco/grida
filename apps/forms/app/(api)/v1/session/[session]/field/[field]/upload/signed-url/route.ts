import { GRIDA_FORMS_RESPONSE_BUCKET } from "@/k/env";
import { client } from "@/lib/supabase/server";
import {
  FileStorage,
  SessionStagedFileStorage,
} from "@/services/form/session-storage";
import { createXSupabaseClient } from "@/services/x-supabase";
import { FormFieldStorageSchema } from "@/types";
import type {
  CreateSessionSignedUploadUrlRequest,
  FormsApiResponse,
  SessionSignedUploadUrlData,
} from "@/types/private/api";
import assert from "assert";
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

  const { data, error } = await sign({
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

  const { data, error } = await sign({
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

async function sign({
  session_id,
  field_id,
  file,
  config,
}: {
  session_id: string;
  field_id: string;
  file: {
    name: string;
  };
  config?: {
    unique?: boolean;
  };
}) {
  const { data, error } = await client
    .from("response_session")
    .select(
      `id, form:form( fields:form_field( id, storage ), supabase_connection:connection_supabase(*) )`
    )
    .eq("id", session_id)
    .single();

  if (error || !data) {
    throw error;
  }

  const { form } = data;

  if (!form) {
    throw new Error("form not found");
  }

  const field = form.fields.find((field) => field.id === field_id);

  if (!field) {
    throw new Error("field not found");
  }

  if (field.storage) {
    const { type, mode, bucket, path } =
      field.storage as any as FormFieldStorageSchema;

    switch (type) {
      case "x-supabase": {
        assert(form.supabase_connection, "supabase_connection not found");
        const client = await createXSupabaseClient(
          form.supabase_connection.supabase_project_id,
          {
            service_role: true,
          }
        );
        switch (mode) {
          case "direct": {
            const storage = new FileStorage(client, bucket);
            return storage.sign(path);
            break;
          }
          case "staged": {
            const storage = new SessionStagedFileStorage(client, bucket);
            return storage.sessionStagedUploadPresingedUrl(
              {
                field_id: field_id,
                session_id: session_id,
              },
              file.name,
              config?.unique
            );
          }
        }
        break;
      }
      case "grida":
      case "x-s3":
      default:
        throw new Error("storage type not supported");
    }
  } else {
    const storage = new SessionStagedFileStorage(
      client,
      GRIDA_FORMS_RESPONSE_BUCKET
    );

    return storage.sessionStagedUploadPresingedUrl(
      {
        field_id: field_id,
        session_id: session_id,
      },
      file.name,
      config?.unique
    );
  }
}
