import { NextRequest, NextResponse } from "next/server";
import {
  experimental_generateImage,
  type GeneratedFile,
  type ImageModel,
} from "ai";
import { openai } from "@ai-sdk/openai";
import { replicate } from "@ai-sdk/replicate";
import { createLibraryClient, service_role } from "@/lib/supabase/server";
import { v4 } from "uuid";
import { ai_credit_limit } from "../../ratelimit";
import mime from "mime-types";
import ai from "@/lib/ai";

export type GenerateImageApiRequestBody = {
  prompt: string;
  width: number;
  height: number;
  model: ai.image.ProviderModel | ai.image.ImageModelId;
};

export type GenerateImageApiResponse = {
  data: {
    object: any;
    publicUrl: string;
    timestamp: string;
    modelId: string;
  };
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

  const model = getImageModel(body.model);
  if (!model) throw new Error("Model not found");

  // generate image
  const generation = await generateImage({
    prompt: body.prompt,
    width: body.width,
    height: body.height,
    model: model,
  });

  const meta = generation.responses[0];

  // save to library
  const { object, publicUrl } = await upload_generated_to_library({
    client: service_role.library,
    request: {
      model: model.modelId,
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
      modelId: meta.modelId,
      timestamp: meta.timestamp.toISOString(),
    },
  } satisfies GenerateImageApiResponse);
}

function getImageModel(
  model: ai.image.ProviderModel | ai.image.ImageModelId
): ImageModel | null {
  if (typeof model === "string") {
    const card = ai.image.models[model];
    if (!card) return null;
    switch (card.provider) {
      case "openai":
        return openai.image(card.id);
      case "replicate":
        return replicate.image(card.id);
      default:
        return null;
    }
  }

  switch (model.provider) {
    case "openai":
      return openai.image(model.modelId);
    case "replicate":
      return replicate.image(model.modelId);
    default:
      return null;
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
    model: ai.image.ImageModelId;
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
      generator: request.model,
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
  model,
  prompt,
  width,
  height,
}: {
  model: ImageModel;
  prompt: string;
  width: number;
  height: number;
}) {
  return await experimental_generateImage({
    model: model,
    prompt: prompt,
    size: `${width}x${height}`,
    n: 1,
  });
}
