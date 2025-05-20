import assert from "assert";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";
import { Authentication } from "@/lib/auth";
import { service_role } from "@/lib/supabase/server";
import parsePhoneNumber from "libphonenumber-js";
import { resolve_next } from "@/host/url";
import { headers } from "next/headers";
import {
  haccept,
  hcontenttype,
  HeaderAccept,
  HeaderContentType,
} from "@/utils/h";
import { flatten } from "flat";
import { Platform } from "@/lib/platform";

type Params = {
  policy: string;
};

type Context = {
  params: Promise<Params>;
};

async function reqformdata(
  req: NextRequest,
  contenttype: HeaderContentType
): Promise<FormData> {
  switch (contenttype) {
    case "application/json":
      const json = await req.json();
      const formdata = new FormData();

      for (var key in json) {
        formdata.append(key, json[key]);
      }
      return formdata;
    case "multipart/form-data":
      return await req.formData();
  }
}

// TODO: add rate limiting
// TODO: add captcha by polocy
// TODO: validate the policy
export async function POST(req: NextRequest, context: Context) {
  const origin = req.nextUrl.origin;
  const next = req.nextUrl.searchParams.get("next");
  const headerslist = await headers();
  const accept = haccept(headerslist.get("accept"));
  const contenttype = hcontenttype(headerslist.get("content-type"));
  const formdata = await reqformdata(req, contenttype);
  const { policy: policyid } = await context.params;

  const { data: policy, error: policy_fetch_err } = await service_role.workspace
    .from("customer_auth_policy")
    .select("*")
    .eq("id", policyid)
    .single();

  if (policy_fetch_err) {
    console.error("Failed to fetch policy", policy_fetch_err);
    return notFound();
  }

  // const policy = mockpolicies[policyid as keyof typeof mockpolicies];

  if (!policy) {
    console.error("policy not found", policyid);
    return notFound();
  }

  const { project_id, challenges } = policy;

  // FIXME: only supports 1 challenge for now
  assert(challenges.length === 1);
  const challenge = challenges[0] as Authentication.Challenge;

  const data = Object.fromEntries(formdata) as Record<string, string>;

  try {
    const submission = Authentication.form(challenge, data);
    assert(challenge.type === submission.type);

    // dynamically query customer with the data
    const query = service_role.workspace
      .from("customer")
      .select("*")
      .eq("project_id", project_id);

    switch (submission.type) {
      case "passcode": {
        break;
      }
      case "kba": {
        assert(challenge.type === "kba");

        let identity: string | null = submission.identity;
        if (challenge.identifier === "phone") {
          const phone = parsePhoneNumber(submission.identity);
          identity = (phone?.number as string) ?? null;
        }

        query.eq(challenge.identifier, identity);

        for (const [key, value] of Object.entries(submission.answers)) {
          if (key === challenge.identifier) continue; // skip the identifier as it's already queried
          if (key in Platform.Customer.challenges) {
            query.eq(key, value);
          } else {
            // TODO: support metadata jsonb subquery
          }
        }
        break;
      }
      default:
        throw new Error("Unsupported challenge type");
    }

    const { data: customer, error: customer_identification_error } =
      // execute query, enforce single
      await query.single();

    if (customer_identification_error) {
      console.error(
        "Failed to identify customer",
        customer_identification_error,
        "input data was..",
        JSON.stringify(submission)
      );
      return reject(accept, {
        redirect_uri: `${origin}/p/login/${policyid}?error=1`,
      });
    }

    let passed = false;
    switch (challenge.type) {
      case "kba": {
        passed = Authentication.verify(challenge, submission, {
          type: "kba",
          identity: customer[
            challenge.identifier as keyof typeof customer
          ] as string,
          answers: flatten(customer),
        });
      }
    }

    if (!passed) {
      return reject(accept, {
        redirect_uri: `${origin}/p/login/${policyid}?error=1`,
      });
    }

    if (passed) {
      // ok
      const redirect = next
        ? resolve_next(origin, next)
        : `${origin}/p/session/${policyid}`;

      const scopedcustomer = {
        metadata: customer.metadata,
      };

      return resolve(accept, {
        customer: scopedcustomer,
        redirect_uri: redirect,
      });
    }
  } catch (e) {
    console.error("Failed to authenticate", e);
    return reject(accept, {
      redirect_uri: `${origin}/p/login/${policyid}?error=1`,
    });
  }
}

/**
 * Scoped customer object.
 *
 * By default, the requested customer object is scoped to only return the requested scope.
 *
 * Since, user can make a mistake with the configuration, we return only include `metadata` field by default, and other are not included.
 */
type ScopedCustomerData = {
  [key: string]: any;
  metadata: any;
};

function resolve(
  accept: HeaderAccept,
  {
    redirect_uri,
    customer,
  }: {
    customer: ScopedCustomerData;
    redirect_uri: string;
  }
) {
  //
  switch (accept) {
    case "text/html":
      return NextResponse.redirect(redirect_uri, {
        status: 302,
      });

    case "application/json": {
      return NextResponse.json(
        { success: true, data: { customer } },
        { status: 200 }
      );
    }
  }
}

function reject(
  accept: HeaderAccept,
  { redirect_uri }: { redirect_uri?: string }
) {
  switch (accept) {
    case "text/html":
      if (redirect_uri) {
        return NextResponse.redirect(redirect_uri, {
          status: 302,
        });
      } else {
        return new NextResponse("Authentication failed", {
          status: 401,
          headers: {
            "content-type": "text/html",
          },
        });
      }
    case "application/json": {
      return NextResponse.json(
        { error: "Authentication failed" },
        { status: 401 }
      );
    }
  }
}
