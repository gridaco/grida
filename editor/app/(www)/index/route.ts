// Tenant host rewriting must run before this app-only redirect. An external
// rewrite to the standalone site can consume its redirect and return HTML.
export function GET() {
  return Response.redirect("https://grida.co/home", 307);
}
