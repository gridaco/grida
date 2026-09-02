import ImagePlaygroundClient from "./image-playground-client";
import { ImagePlaygroundModel } from "./image-playground-model";

export default async function ImagePlaygroundPage({
  searchParams,
}: {
  searchParams: Promise<{ model?: string | string[] }>;
}) {
  const params = await searchParams;
  const initialModelId = ImagePlaygroundModel.initial(params.model);

  return <ImagePlaygroundClient initialModelId={initialModelId} />;
}
