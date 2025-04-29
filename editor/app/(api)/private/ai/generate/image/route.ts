import { NextRequest, NextResponse } from "next/server";
import { experimental_generateImage, type GeneratedFile } from "ai";
import { openai } from "@ai-sdk/openai";
import { replicate } from "@ai-sdk/replicate";
import { createLibraryClient, service_role } from "@/lib/supabase/server";
import { v4 } from "uuid";
import mime from "mime-types";
import ai from "@/lib/ai";
import { ai_credit_limit } from "../../ratelimit";

type GenerateImageApiRequestBody = {
  prompt: string;
  width: number;
  height: number;
  model: ai.image.ProviderModel;
};

export async function POST(req: NextRequest) {
  const body = (await req.json()) as GenerateImageApiRequestBody;
  const ip = req.headers.get("x-forwarded-for");
  const client = await createLibraryClient();

  // base auth
  const { data: userdata } = await client.auth.getUser();
  if (!userdata.user) {
    return NextResponse.json({ message: "login required" }, { status: 401 });
  }

  const rate = await ai_credit_limit();
  if (!rate) {
    return NextResponse.json(
      { message: "something went wrong" },
      { status: 500 }
    );
  }

  if (!rate.success) {
    return NextResponse.json(
      {
        message: "ratelimit exceeded",
        limit: rate.limit,
        reset: rate.reset,
        remaining: rate.remaining,
      },
      {
        status: 429,
        headers: { ...rate.headers },
      }
    );
  }

  // generate image
  const generation = await generateImage({
    prompt: body.prompt,
    width: body.width,
    height: body.height,
    model: body.model,
  });

  // save to library
  const { object, publicUrl } = await upload_generated_to_library({
    client: service_role.library,
    request: {
      model: body.model,
      prompt: body.prompt,
      width: body.width,
      height: body.height,
    },
    file: generation.image,
  });

  // response
  return NextResponse.json({
    data: {
      object,
      publicUrl,
    },
  });
}

function getImageModel(model: ai.image.ProviderModel) {
  switch (model.provider) {
    case "openai":
      return openai.image(model.modelId);
    case "replicate":
      return replicate.image(model.modelId);
    default:
      return undefined;
  }
}

async function upload_generated_to_library({
  client,
  file,
  request,
}: {
  client: Awaited<ReturnType<typeof createLibraryClient>>;
  file: GeneratedFile;
  request: {
    model: ai.image.ProviderModel;
    prompt: string;
    width: number;
    height: number;
  };
}) {
  const { mimeType, uint8Array } = file;

  const ext = mime.extension(mimeType);
  const name = v4();
  const folder = "generated";
  const path = `${folder}/${name}${ext ? `.${ext}` : ""}`;

  const { data: uploaded, error: upload_err } =
    await service_role.library.storage
      .from("library")
      .upload(path, uint8Array, {
        contentType: mimeType,
      });

  if (upload_err) throw new Error(upload_err.message);

  const { data: object, error: object_err } = await client
    .from("object")
    .insert({
      id: uploaded.id,
      bytes: uint8Array.length,
      category: "generated",
      path: uploaded.path,
      mimetype: mimeType,
      //
      generator: request.model.modelId,
      prompt: request.prompt,
      //
      width: request.width,
      height: request.height,
      transparency: false,
    })
    .select()
    .single();

  if (object_err) throw new Error(object_err.message);

  const publicUrl = client.storage.from("library").getPublicUrl(object.path)
    .data.publicUrl;

  return {
    object,
    publicUrl,
  };
}

async function generateImage({
  model: _model,
  prompt,
  width,
  height,
}: {
  model: ai.image.ProviderModel;
  prompt: string;
  width: number;
  height: number;
}) {
  const model = getImageModel(_model);
  if (!model) throw new Error("Model not found");

  return await experimental_generateImage({
    model: model,
    prompt: prompt,
    size: `${width}x${height}`,
    n: 1,
  });
}
