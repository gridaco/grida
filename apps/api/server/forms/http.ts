export function notFound(): Response {
  return Response.json({ error: "not found" }, { status: 404 });
}

export function redirect(
  url: string | URL,
  options: { status: number }
): Response {
  return Response.redirect(url, options.status);
}
