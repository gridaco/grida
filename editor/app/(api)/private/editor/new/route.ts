import { editorlink } from "@/lib/forms/url";
import { createClient } from "@/lib/supabase/server";
import {
  SchemaDocumentSetupAssistantService,
  FormDocumentSetupAssistantService,
  SiteDocumentSetupAssistantService,
  CanvasDocumentSetupAssistantService,
  BucketDocumentSetupAssistantService,
} from "@/services/new";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";
import assert from "assert";
import { EditorApiResponse } from "@/types/private/api";
import {
  bucket_validation_messages,
  isValidBucketName,
  isValidSchemaName,
  schemaname_validation_messages,
} from "@/services/utils/regex";

export const revalidate = 0;

export type NewDocumentRequest =
  | {
      project_id: number;
      doctype: "v0_schema";
      name: string;
    }
  | {
      project_id: number;
      doctype: "v0_bucket";
      name: string;
      public: boolean;
    }
  | {
      project_id: number;
      doctype: "v0_form";
      title?: string;
    }
  | {
      project_id: number;
      doctype: "v0_site";
      title?: string;
    }
  | {
      project_id: number;
      doctype: "v0_canvas";
      title?: string;
    };

export type NewDocumentResponse = EditorApiResponse<
  {
    document_id: string;
    redirect: string;
  },
  {
    message: string;
  }
>;

export async function POST(request: NextRequest) {
  const wsclient = await createClient();
  const origin = request.nextUrl.origin;
  const data = (await request.json()) as NewDocumentRequest;
  const { project_id } = data;

  assert(project_id, "project_id is required");
  assert(data.doctype, "doctype is required");

  const { data: project_ref, error: project_ref_err } = await wsclient
    .from("project")
    .select(`id, name, organization(name)`)
    .eq("id", project_id)
    .single();

  if (project_ref_err) {
    console.error(project_ref_err);
    return NextResponse.error();
  }

  if (!project_ref) {
    return notFound();
  }

  switch (data.doctype) {
    case "v0_form": {
      try {
        const setup = new FormDocumentSetupAssistantService(project_id, {
          title: data.title,
        });
        const { form_document_id } = await setup.createFormDocument();

        try {
          await setup.seedFormDocumentBlocks();
        } catch (e) {
          // this won't be happening
          console.error("error while seeding form page blocks", e);
          // ignore and continue since the form itself is created anyway.
        }

        return NextResponse.json({
          data: {
            document_id: form_document_id,
            redirect: editorlink("form/edit", {
              proj: project_ref.name,
              org: project_ref.organization!.name,
              origin,
              document_id: form_document_id,
            }),
          },
        } satisfies NewDocumentResponse);
      } catch (e) {
        console.error("error while creating new form", e);
        return NextResponse.error();
      }
      break;
    }
    case "v0_site": {
      const setup = new SiteDocumentSetupAssistantService(project_id, {
        title: data.title,
      });
      const { id } = await setup.createSiteDocument();

      return NextResponse.json({
        data: {
          document_id: id,
          redirect: editorlink(".", {
            proj: project_ref.name,
            org: project_ref.organization!.name,
            origin,
            document_id: id,
          }),
        },
      } satisfies NewDocumentResponse);

      break;
    }
    case "v0_schema": {
      // prevalidate the name.
      if (!isValidSchemaName(data.name)) {
        return NextResponse.json({
          data: null,
          error: {
            message: schemaname_validation_messages["invalid"],
          },
        } as NewDocumentResponse);
      }

      try {
        const setup = new SchemaDocumentSetupAssistantService(project_id, {
          name: data.name,
        });
        const { id } = await setup.createSchemaDocument();

        return NextResponse.json({
          data: {
            document_id: id,
            redirect: editorlink(".", {
              proj: project_ref.name,
              org: project_ref.organization!.name,
              origin,
              document_id: id,
            }),
          },
        } satisfies NewDocumentResponse);
      } catch (e) {
        if (e instanceof Error) {
          return NextResponse.json({
            data: null,
            error: {
              message: e.message,
            },
          } as NewDocumentResponse);
        }

        console.error("error while creating new schema", e);
        return NextResponse.error();
      }
      break;
    }
    case "v0_bucket": {
      if (!isValidBucketName(data.name)) {
        return NextResponse.json({
          data: null,
          error: {
            message: bucket_validation_messages["invalid"],
          },
        } as NewDocumentResponse);
      }

      try {
        const setup = new BucketDocumentSetupAssistantService(project_id, {
          name: data.name,
          public: data.public,
        });
        const { id } = await setup.createBucketDocument();

        return NextResponse.json({
          data: {
            document_id: id,
            redirect: editorlink(".", {
              proj: project_ref.name,
              org: project_ref.organization!.name,
              origin,
              document_id: id,
            }),
          },
        } satisfies NewDocumentResponse);
      } catch (e) {
        if (e instanceof Error) {
          return NextResponse.json({
            data: null,
            error: {
              message: e.message,
            },
          } as NewDocumentResponse);
        }

        console.error("error while creating new bucket", e);
        return NextResponse.error();
      }
      break;
    }
    case "v0_canvas": {
      const setup = new CanvasDocumentSetupAssistantService(project_id, {
        title: data.title,
      });
      const { id } = await setup.createCanvasDocument();

      return NextResponse.json({
        data: {
          document_id: id,
          redirect: editorlink(".", {
            proj: project_ref.name,
            org: project_ref.organization!.name,
            origin,
            document_id: id,
          }),
        },
      } satisfies NewDocumentResponse);
    }
    default: {
      console.error("unknown doctype");
      return NextResponse.error();
    }
  }
}
