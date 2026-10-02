export async function createRow(
  table_id: string,
  data: FormData
): Promise<void> {
  const response = await fetch(`/v1/submit/${table_id}`, {
    method: "POST",
    body: data,
  });

  if (!response.ok) {
    throw new Error(`Failed to save row (${response.status}).`);
  }
}
