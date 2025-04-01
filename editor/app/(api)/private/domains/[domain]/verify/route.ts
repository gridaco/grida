import { projectsVerifyProjectDomain } from "@/clients/vercel";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  // const reqjson = await req.json()
  const r = await projectsVerifyProjectDomain("domain-name.com");
  console.log(r);

  return NextResponse.json(r, {
    status: 200,
  });
}
