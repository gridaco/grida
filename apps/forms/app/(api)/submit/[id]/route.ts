import {
  SYSTEM_GF_KEY_STARTS_WITH,
  SYSTEM_GF_FINGERPRINT_VISITORID_KEY,
  SYSTEM_GF_CUSTOMER_UUID_KEY,
  SYSTEM_GF_GEO_CITY_KEY,
  SYSTEM_GF_GEO_COUNTRY_KEY,
  SYSTEM_GF_GEO_LATITUDE_KEY,
  SYSTEM_GF_GEO_LONGITUDE_KEY,
  SYSTEM_GF_GEO_REGION_KEY,
  SYSTEM_GF_SIMULATOR_FLAG_KEY,
} from "@/k/system";
import { client, grida_commerce_client } from "@/lib/supabase/server";
import { upsert_customer_with } from "@/services/customer";
import { validate_max_access } from "@/services/form/validate-max-access";
import { is_uuid_v4 } from "@/utils/is";
import { NextRequest, NextResponse } from "next/server";
import { formlink } from "@/lib/forms/url";
import {
  FORM_CLOSED_WHILE_RESPONDING,
  MISSING_REQUIRED_HIDDEN_FIELDS,
} from "@/k/error";
import {
  FormFieldOptionsInventoryMap,
  form_field_options_inventory,
  validate_options_inventory,
} from "@/services/form/inventory";
import assert from "assert";
import { GridaCommerceClient } from "@/services/commerce";
import { SubmissionHooks } from "./hooks";
import { Features } from "@/lib/features/scheduling";
import { IpInfo, ipinfo } from "@/lib/ipinfo";
import type { Geo, PlatformPoweredBy } from "@/types";
import { XX212 } from "@/k/errcode";

const HOST = process.env.HOST || "http://localhost:3000";

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

  const data = req.nextUrl.searchParams as any;
  return submit({
    data: data,
    form_id,
    meta: meta(req, data),
  });
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

  return submit({ data, form_id, meta: meta(req, data) });
}

interface SessionMeta {
  //
  ip: string | null;
  geo?: Geo | null;
  referer: string | null;
  browser: string | null;
  useragent: string | null;
  platform_powered_by: PlatformPoweredBy | null;
}

function meta(req: NextRequest, data?: FormData) {
  console.log("ip", {
    ip: req.ip,
    "x-real-ip": req.headers.get("x-real-ip"),
    "x-forwarded-for": req.headers.get("x-forwarded-for"),
  });

  console.log("geo", req.geo);

  const meta: SessionMeta = {
    useragent: req.headers.get("user-agent"),
    ip:
      req.ip ||
      req.headers.get("x-real-ip") ||
      req.headers.get("x-forwarded-for"),
    geo: req.geo,
    referer: req.headers.get("referer"),
    browser: req.headers.get("sec-ch-ua"),
    platform_powered_by: "web_client",
  };

  // optionally, developer can override the ip and geo via data body.
  if (data) {
    // gf geo
    const __GF_GEO_LATITUDE = data.get(SYSTEM_GF_GEO_LATITUDE_KEY);
    const __GF_GEO_LONGITUDE = data.get(SYSTEM_GF_GEO_LONGITUDE_KEY);
    const __GF_GEO_REGION = data.get(SYSTEM_GF_GEO_REGION_KEY);
    const __GF_GEO_COUNTRY = data.get(SYSTEM_GF_GEO_COUNTRY_KEY);
    const __GF_GEO_CITY = data.get(SYSTEM_GF_GEO_CITY_KEY);

    if (
      __GF_GEO_LATITUDE ||
      __GF_GEO_LONGITUDE ||
      __GF_GEO_REGION ||
      __GF_GEO_COUNTRY ||
      __GF_GEO_CITY
    ) {
      // all or neither the lat and long should be present
      assert(
        (__GF_GEO_LATITUDE && __GF_GEO_LONGITUDE) ||
          (!__GF_GEO_LATITUDE && !__GF_GEO_LONGITUDE),
        "Both or neither latitude and longitude should be present"
      );

      meta.geo = {
        latitude: __GF_GEO_LATITUDE ? String(__GF_GEO_LATITUDE) : undefined,
        longitude: __GF_GEO_LONGITUDE ? String(__GF_GEO_LONGITUDE) : undefined,
        region: __GF_GEO_REGION ? String(__GF_GEO_REGION) : undefined,
        country: __GF_GEO_COUNTRY ? String(__GF_GEO_COUNTRY) : undefined,
        city: __GF_GEO_CITY ? String(__GF_GEO_CITY) : undefined,
      };
    }

    // gf simulator flag
    const __GF_SIMULATOR_FLAG = data.get(SYSTEM_GF_SIMULATOR_FLAG_KEY);
    if (__GF_SIMULATOR_FLAG) {
      if (qboolean(String(__GF_SIMULATOR_FLAG))) {
        meta.platform_powered_by = "simulator";
      }
    }
  }

  return meta;
}

async function submit({
  data,
  form_id,
  meta,
}: {
  form_id: string;
  data: FormData;
  meta: SessionMeta;
}) {
  console.log("form_id", form_id);

  // check if form exists
  const { data: form_reference } = await client
    .from("form")
    .select(
      `
        *,
        fields:form_field(
          *,
          options:form_field_option(*)
        ),
        store_connection:connection_commerce_store(*)
      `
    )
    .eq("id", form_id)
    .single();

  if (!form_reference) {
    return NextResponse.json({ error: "Form not found" }, { status: 404 });
  }

  const {
    project_id,
    unknown_field_handling_strategy,
    is_redirect_after_response_uri_enabled,
    is_ending_page_enabled,
    ending_page_template_id,
    redirect_after_response_uri,
    is_max_form_responses_in_total_enabled,
    max_form_responses_in_total,
    is_max_form_responses_by_customer_enabled,
    max_form_responses_by_customer,
    is_force_closed,
    is_scheduling_enabled,
    scheduling_open_at,
    scheduling_close_at,
    store_connection,
    fields,
  } = form_reference;

  const entries = data.entries();

  const __keys_all = Array.from(data.keys());
  const system_gf_keys = __keys_all.filter((key) =>
    key.startsWith(SYSTEM_GF_KEY_STARTS_WITH)
  );
  const nonsystem_keys = __keys_all.filter(
    (key) => !system_gf_keys.includes(key)
  );

  console.log("submit", meta);

  // pre meta processing
  let ipinfo_data: IpInfo | null = null;
  if (meta.ip && isObjectEmpty(meta.geo)) {
    try {
      ipinfo_data = await ipinfo(meta.ip, process.env.IPINFO_ACCESS_TOKEN);
      console.log("ipinfo", ipinfo_data);
    } catch (e) {
      console.error(e);
    }
  } else {
    console.error("ip not found");
  }

  // customer handling

  const _gf_customer_uuid: string | null = val(
    data.get(SYSTEM_GF_CUSTOMER_UUID_KEY) as string
  );

  const _fp_fingerprintjs_visitorid: string | null = data.get(
    SYSTEM_GF_FINGERPRINT_VISITORID_KEY
  ) as string;

  // console.log("/submit::_gf_customer_uuid:", _gf_customer_uuid);

  const customer = await upsert_customer_with({
    project_id: form_reference.project_id,
    uuid: _gf_customer_uuid,
    hints: {
      _fp_fingerprintjs_visitorid,
    },
  });

  console.log("/submit::customer:", customer);

  const required_hidden_fields = fields.filter(
    (f) => f.type === "hidden" && f.required
  );

  // validation - check if all value is present for required hidden fields
  const missing_required_hidden_fields = required_hidden_fields.filter((f) => {
    // TODO: to be more clear, rather than checking if the value is present, check if the value matches the required format, e.g. uuidv4 for __gf_customer_uuid
    return !(__keys_all.includes(f.name) && !!data.get(f.name));
  });

  if (missing_required_hidden_fields.length > 0) {
    console.error("error", MISSING_REQUIRED_HIDDEN_FIELDS);

    // TODO: return json instead on devmode
    return NextResponse.redirect(
      formlink(HOST, form_id, "badrequest", {
        error: MISSING_REQUIRED_HIDDEN_FIELDS.code,
      }),
      {
        status: 301,
      }
    );
  }

  // validation - check if new response is accepted for custoemer
  const max_access_error = await validate_max_access({
    form_id,
    customer_id: customer?.uid,
    is_max_form_responses_in_total_enabled,
    max_form_responses_in_total,
    is_max_form_responses_by_customer_enabled,
    max_form_responses_by_customer,
  });

  if (max_access_error) {
    switch (max_access_error.code) {
      case "FORM_RESPONSE_LIMIT_BY_CUSTOMER_REACHED":
        return NextResponse.redirect(
          formlink(HOST, form_id, "alreadyresponded"),
          {
            status: 301,
          }
        );
      case "FORM_RESPONSE_LIMIT_REACHED":
        return NextResponse.redirect(
          formlink(HOST, form_id, "formclosed", {
            oops: FORM_CLOSED_WHILE_RESPONDING.code,
          }),
          {
            status: 301,
          }
        );
      default:
        return NextResponse.json(
          {
            error: max_access_error,
          },
          {
            status: 400,
          }
        );
    }
  }

  // validation - check if form is force closed
  if (is_force_closed) {
    return NextResponse.redirect(
      formlink(HOST, form_id, "formclosed", {
        oops: FORM_CLOSED_WHILE_RESPONDING.code,
      }),
      {
        status: 301,
      }
    );
  }

  // validation - check if form is open by schedule
  if (is_scheduling_enabled) {
    const isopen = Features.isopen({
      open: scheduling_open_at,
      close: scheduling_close_at,
    });

    if (!isopen) {
      return NextResponse.redirect(
        formlink(HOST, form_id, "formclosed", {
          oops: FORM_CLOSED_WHILE_RESPONDING.code,
        }),
        {
          status: 301,
        }
      );
    }
  }

  // validatopn - check if user selected option is connected to inventory and is available
  let options_inventory: FormFieldOptionsInventoryMap | null = null;
  if (store_connection) {
    const commerce = new GridaCommerceClient(
      grida_commerce_client,
      project_id,
      store_connection.store_id
    );

    options_inventory = await form_field_options_inventory({
      project_id: project_id,
      store_id: store_connection.store_id,
    });
    const inventory_keys = Object.keys(options_inventory);

    // TODO: this may conflict the validation policy since v1/load uses render fields.
    const options = form_reference.fields.map((f) => f.options).flat();

    // TODO: now we only support one inventory option selection per form
    const data_present_option_fields = fields.filter((f) => {
      return f.options.length > 0 && !!data.get(f.name);
    });

    // get the option id that is both present in inventory and form data
    const possible_selection_option_ids = data_present_option_fields
      .map((f) => String(data.get(f!.name)))
      .filter((id) => inventory_keys.includes(id));

    assert(
      possible_selection_option_ids.length <= 1,
      "Multiple inventory options is not supported yet."
    );

    const selection_id =
      possible_selection_option_ids.length == 1
        ? possible_selection_option_ids[0]
        : null;

    console.log("selection_id", selection_id);

    // validate if inventory is present
    const inventory_access_error = await validate_options_inventory({
      inventory: options_inventory,
      options: options,
      selection: selection_id ? { id: selection_id } : undefined,
      config: {
        available_counting_strategy: "sum_positive",
      },
    });
    if (inventory_access_error) {
      console.error(inventory_access_error);
      switch (inventory_access_error.code) {
        case "FORM_SOLD_OUT":
          return NextResponse.redirect(formlink(HOST, form_id, "formsoldout"), {
            status: 301,
          });
        case "FORM_OPTION_UNAVAILABLE": {
          return NextResponse.redirect(
            formlink(HOST, form_id, "formoptionsoldout"),
            {
              status: 301,
            }
          );
        }
      }
    }

    if (selection_id) {
      // TODO: only supports single inventory option selection
      // update the inventory as selected
      await commerce.upsertInventoryItem({
        sku: selection_id,
        level: {
          diff: -1,
          reason: "order",
        },
      });
    }
  }

  // get the fields ready
  // TODO: no need to fetch fields again
  const { data: form_fields } = await client
    .from("form_field")
    .select("*, options:form_field_option(*)")
    .eq("form_id", form_id);

  // group by existing and new fields
  const known_names = nonsystem_keys.filter((key) => {
    return form_fields!.some((field: any) => field.name === key);
  });

  const unknown_names = nonsystem_keys.filter((key) => {
    return !form_fields!.some((field: any) => field.name === key);
  });
  const ignored_names: string[] = [];
  const target_names: string[] = [];
  let needs_to_be_created: string[] | null = null;

  // create new fields by preference
  if (
    unknown_field_handling_strategy === "ignore" &&
    unknown_names.length > 0
  ) {
    // ignore new fields
    ignored_names.push(...unknown_names);
    // add only existing fields to mapping
    target_names.push(...known_names);
  } else {
    // add all fields to mapping
    target_names.push(...known_names);
    target_names.push(...unknown_names);

    if (unknown_field_handling_strategy === "accept") {
      needs_to_be_created = [...unknown_names];
    } else if (unknown_field_handling_strategy === "reject") {
      if (unknown_names.length > 0) {
        // reject all fields
        return NextResponse.json(
          {
            error: "Unknown fields are not allowed",
            info: {
              message:
                "To allow unknown fields, set 'unknown_field_handling_strategy' to 'ignore' or 'accept' in the form settings.",
              data: { keys: unknown_names },
            },
          },
          {
            status: 400,
          }
        );
      }
    }
  }

  if (needs_to_be_created) {
    // create new fields
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

    // extend form_fields with new fields (match the type)
    form_fields!.push(...new_fields?.map((f) => ({ ...f, options: [] }))!);
  }

  // create new form response
  const { data: response_reference_obj, error: response_insertion_error } =
    await client
      .from("response")
      .insert({
        raw: JSON.stringify(Object.fromEntries(entries)),
        form_id: form_id,
        browser: meta.browser,
        ip: meta.ip,
        customer_id: customer?.uid,
        x_referer: meta.referer,
        x_useragent: meta.useragent,
        x_ipinfo: ipinfo_data as {},
        geo: isObjectEmpty(meta.geo)
          ? ipinfo_data
            ? ipinfogeo(ipinfo_data)
            : undefined
          : (meta.geo as {}),
        platform_powered_by: meta.platform_powered_by,
      })
      .select("id")
      .single();

  if (response_insertion_error) {
    console.error("submit/err", response_insertion_error);

    switch (response_insertion_error.code) {
      case XX212: {
        // max response limit reached
        return NextResponse.redirect(
          formlink(HOST, form_id, "formclosed", {
            oops: FORM_CLOSED_WHILE_RESPONDING.code,
          }),
          {
            status: 301,
          }
        );
      }
      default: {
        // server error
        console.error("submit/err", 500);
        return NextResponse.redirect(
          formlink(HOST, form_id, "badrequest", {
            error: response_insertion_error.code,
          }),
          {
            status: 301,
          }
        );
      }
    }
  }

  // save each field value
  const { data: response_fields } = await client
    .from("response_field")
    .insert(
      form_fields!.map((field) => {
        const { name, options } = field;

        // the field's value can be a input value or a reference to form_field_option
        const value_or_reference = data.get(name);

        // check if the value is a reference to form_field_option
        const is_value_fkey_and_found =
          is_uuid_v4(value_or_reference as string) &&
          options?.find((o: any) => o.id === value_or_reference);

        // locate the value
        const value = is_value_fkey_and_found
          ? is_value_fkey_and_found.value
          : value_or_reference;

        return {
          type: field.type,
          response_id: response_reference_obj!.id,
          form_field_id: field.id,
          form_id: form_id,
          value: JSON.stringify(value),
          form_field_option_id: is_value_fkey_and_found
            ? is_value_fkey_and_found.id
            : null,
        };
      })
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

  // ==================================================
  // region response building
  // ==================================================

  // build info
  let info: any = {};

  // if there are new fields
  if (needs_to_be_created?.length) {
    info.new_keys = {
      message:
        "There were new unknown fields in the request and the definitions are created automatically. To disable them, set 'unknown_field_handling_strategy' to 'ignore' or 'reject' in the form settings.",
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
        "There were unknown fields in the request. To allow them, set 'unknown_field_handling_strategy' to 'accept' in the form settings.",
      data: { keys: ignored_names },
    };
  }

  // endregion

  // ==================================================
  // region complete hooks
  // ==================================================

  // [emails]

  const business_profile = {
    name: "Grida Forms",
    email: "no-reply@cors.sh",
  };

  // FIXME: DEV MODE
  const _email_enabled = false;
  if (_email_enabled) {
    await SubmissionHooks.send_email({
      form_id: form_id,
      type: "formcomplete",
      from: {
        name: business_profile.name,
        email: business_profile.email,
      },
      to: "universe@grida.co",
      lang: "en",
    });
    // send email
  }

  // [sms]

  const _sms_enabled = false;
  if (_sms_enabled) {
    await SubmissionHooks.send_sms({
      form_id: form_id,
      type: "formcomplete",
      to: "...",
      lang: "en",
    });
    // send sms
  }

  // endregion

  // ==================================================
  // region final response
  // ==================================================

  if (is_ending_page_enabled && ending_page_template_id) {
    return NextResponse.redirect(
      formlink(HOST, form_id, "complete", {
        rid: response?.id,
      }),
      {
        status: 301,
      }
    );
  }

  if (is_redirect_after_response_uri_enabled && redirect_after_response_uri) {
    return NextResponse.redirect(redirect_after_response_uri, {
      status: 301,
    });
  }

  return NextResponse.json({
    data: response,
    raw: response?.raw,
    warning: Object.keys(warning).length > 0 ? warning : null,
    info: Object.keys(info).length > 0 ? info : null,
    error: null,
  });

  // endregion
}

const val = (v?: string | null) => {
  if (v) return v;
  else return null;
};

function isObjectEmpty(obj: object | null | undefined) {
  try {
    // @ts-ignore
    return Object.keys(obj).length === 0;
  } catch (e) {
    return true;
  }
}

function ipinfogeo(ipinfo: IpInfo): Geo | null {
  if (!ipinfo) return null;
  if (ipinfo.loc) {
    const [lat, long] = ipinfo.loc.split(",");
    return {
      city: ipinfo.city,
      country: ipinfo.country,
      region: ipinfo.region,
      latitude: lat,
      longitude: long,
    };
  }

  return {
    city: ipinfo.city,
    country: ipinfo.country,
    region: ipinfo.region,
  };
}

/**
 * Convert string to boolean (formdata, searchparams)
 */
function qboolean(v: string | null): boolean {
  return v === "1" || v === "true" || v === "on";
}
