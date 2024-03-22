import { FormClientFetchResponse } from "@/app/(api)/v1/[id]/route";
import { Form } from "@/scaffolds/e/form";
import { EditorApiResponse } from "@/types/private/api";
import { notFound } from "next/navigation";

export const revalidate = 0;

const HOST_NAME = process.env.NEXT_PUBLIC_HOST_NAME || "http://localhost:3000";

export default async function FormPage({ params }: { params: { id: string } }) {
  const id = params.id;

  const res = await (await fetch(HOST_NAME + `/v1/${id}`)).json();
  const { data } = res as EditorApiResponse<FormClientFetchResponse>;

  if (!data) {
    return notFound();
  }

  const { title, blocks } = data;

  return <Form form_id={id} title={title} blocks={blocks} />;
}
