import { Env } from "@/env";
export async function createRow(
  table_id: string,
  data: FormData
): Promise<void> {
  const response = await fetch(
    `${Env.forms.API_ORIGIN}/v1/submit/${table_id}`,
    {
      method: "POST",
      credentials: "omit",
      body: data,
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to save row (${response.status}).`);
  }
}
