import { createApi } from "unsplash-js";
import { NonUndefined, UnwrapArray } from "@/utils";

type Unsplash = ReturnType<typeof createApi>;

type GetRandomPhotoResponse = Awaited<
  ReturnType<Unsplash["photos"]["getRandom"]>
>["response"];

export type RandomPhoto = NonUndefined<UnwrapArray<GetRandomPhotoResponse>>;
