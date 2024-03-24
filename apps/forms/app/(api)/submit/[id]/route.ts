import { client, workspaceclient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

const SYSTEM_GF_KEY_STARTS_WITH = "__gf_";

export const revalidate = 0;

export async function GET(
  req: NextRequest,
  context: {
    params: { id: string };
  }
) {
  const form_id = context.params.id;

  // #region 1 prevalidate request form data (query)
  const __keys = Array.from(req.nextUrl.searchParams.keys());
  const system_gf_keys = __keys.filter((key) =>
    key.startsWith(SYSTEM_GF_KEY_STARTS_WITH)
  );
  const keys = __keys.filter((key) => !system_gf_keys.includes(key));

  if (!keys.length) {
    return NextResponse.json(
      { error: "You must submit form with query params" },
      { status: 400 }
    );
  }
  // #endregion

  const meta = {
    useragent: req.headers.get("user-agent"),
    ip: req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for"),
    referer: req.headers.get("referer"),
    browser: req.headers.get("sec-ch-ua"),
  };

  return submit({ data: req.nextUrl.searchParams as any, form_id, meta });
}

export async function POST(
  req: NextRequest,
  context: {
    params: { id: string };
  }
) {
  const form_id = context.params.id;

  // #region 1 prevalidate request form data
  let data: FormData;
  try {
    data = await req.formData();
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "You must submit form with formdata attatched" },
      { status: 400 }
    );
  }
  // #endregion

  const meta = {
    useragent: req.headers.get("user-agent"),
    ip: req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for"),
    referer: req.headers.get("referer"),
    browser: req.headers.get("sec-ch-ua"),
  };

  return submit({ data, form_id, meta });
}

async function submit({
  data,
  form_id,
  meta,
}: {
  form_id: string;
  data: FormData;
  meta: {
    useragent: string | null;
    ip: string | null;
    referer: string | null;
    browser: string | null;
  };
}) {
  // check if form exists
  const { data: form_reference } = await client
    .from("form")
    .select("*")
    .eq("id", form_id)
    .single();

  if (!form_reference) {
    return NextResponse.json({ error: "Form not found" }, { status: 404 });
  }

  const { is_unknown_field_allowed, redirect_after_response_uri } =
    form_reference;

  const entries = data.entries();
  const __keys = Array.from(data.keys());
  const system_gf_keys = __keys.filter((key) =>
    key.startsWith(SYSTEM_GF_KEY_STARTS_WITH)
  );
  const keys = __keys.filter((key) => !system_gf_keys.includes(key));

  // customer handling
  const _fp_fingerprintjs_visitorid = String(
    data.get("__gf_fp_fingerprintjs_visitorid")
  );

  const { data: customer } = await workspaceclient
    .from("customer")
    .upsert(
      {
        project_id: form_reference.project_id,
        _fp_fingerprintjs_visitorid: _fp_fingerprintjs_visitorid,
        last_seen_at: new Date().toISOString(),
      },
      {
        onConflict: "project_id, _fp_fingerprintjs_visitorid",
      }
    )
    .select()
    .single();

  // create new form response
  const { data: response_reference_obj } = await client
    .from("response")
    .insert({
      raw: JSON.stringify(Object.fromEntries(entries)),
      form_id: form_id,
      browser: meta.browser,
      ip: meta.ip,
      customer_uuid: customer?.uuid,
      x_referer: meta.referer,
      x_useragent: meta.useragent,
      platform_powered_by: "web_client",
    })
    .select("id")
    .single();

  // get the fields ready
  const { data: form_fields } = await client
    .from("form_field")
    .select("*")
    .eq("form_id", form_id);

  // group by existing and new fields
  const known_names = keys.filter((key) => {
    return form_fields!.some((field: any) => field.name === key);
  });

  const unknown_names = keys.filter((key) => {
    return !form_fields!.some((field: any) => field.name === key);
  });
  const ignored_names: string[] = [];
  const target_names: string[] = [];
  let needs_to_be_created: string[] | null = null;

  // create new fields by preference
  if (!is_unknown_field_allowed && unknown_names.length > 0) {
    // ignore new fields
    ignored_names.push(...unknown_names);
    // add only existing fields to mapping
    target_names.push(...known_names);
  } else {
    // add all fields to mapping
    target_names.push(...known_names);
    target_names.push(...unknown_names);

    needs_to_be_created = [...unknown_names];
  }

  // create new fields
  if (needs_to_be_created) {
    const { data: new_fields } = await client
      .from("form_field")
      .insert(
        needs_to_be_created.map((key) => ({
          form_id: form_id,
          name: key,
          type: "text" as const,
          description: "Automatically created",
        }))
      )
      .select("*");

    // extend form_fields with new fields
    form_fields!.push(...new_fields!);
  }

  // save each field value
  const { data: response_fields } = await client
    .from("response_field")
    .insert(
      form_fields!.map((field) => ({
        type: field.type,
        response_id: response_reference_obj!.id,
        form_field_id: field.id,
        form_id: form_id,
        value: JSON.stringify(data.get(field.name)),
      }))
    )
    .select();

  // finally fetch the response for pingback
  const { data: response, error: select_response_error } = await client
    .from("response")
    .select(
      `
        *,
        response_field (
          *
        )
      `
    )
    .eq("id", response_reference_obj!.id)
    .single();

  if (select_response_error) {
    console.error(select_response_error);
  }

  // build info
  let info: any = {};

  // if there are new fields
  if (needs_to_be_created?.length) {
    info.new_keys = {
      message:
        "There were new unknown fields in the request and the definitions are created automatically. To disable them, set is_unknown_field_allowed to false in the form settings.",
      data: {
        keys: needs_to_be_created,
        fields: form_fields!.filter((field: any) =>
          needs_to_be_created!.includes(field.name)
        ),
      },
    };
  }

  // build warning
  let warning: any = {};

  // if there are ignored fields
  if (ignored_names.length > 0) {
    warning.ignored_keys = {
      message:
        "There were unknown fields in the request. To allow them, set is_unknown_field_allowed to true in the form settings.",
      data: { keys: ignored_names },
    };
  }

  if (redirect_after_response_uri) {
    return NextResponse.redirect(redirect_after_response_uri, {
      status: 301,
    });
  }

  return NextResponse.json({
    data: response,
    raw: JSON.stringify(Object.fromEntries(entries)),
    warning: Object.keys(warning).length > 0 ? warning : null,
    info: Object.keys(info).length > 0 ? info : null,
    error: null,
  });
}
