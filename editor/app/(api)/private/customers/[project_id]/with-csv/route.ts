import { createRouteHandlerWorkspaceClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { Platform } from "@/lib/platform";
import Papa from "papaparse";
import assert from "assert";
import { unflatten } from "flat";
import { qboolean } from "@/utils/qs";
import type { Database } from "@/database.types";

type PGCustomerInsert = Database["public"]["Tables"]["customer"]["Insert"];

type Params = {
  project_id: number;
};

async function parse_customers_csv(
  csvf: File,
  project_id: number,
  spec: typeof Platform.Customer.insert | typeof Platform.Customer.update
): Promise<
  | {
      data: PGCustomerInsert[];
      error: null;
      details: any;
    }
  | {
      data: null;
      error: unknown;
      details: any;
    }
> {
  const csvt = await csvf.text();

  const { data: rows, errors: csv_parse_errors } = Papa.parse<
    Record<string, string>
  >(csvt, {
    header: true,
    skipEmptyLines: true,
    comments: "#",
    transform: (value, field) => {
      if (value === "") return undefined;
      return value;
    },
  });

  if (csv_parse_errors.length > 0) {
    return {
      data: null,
      error: "CSV parse error",
      details: csv_parse_errors,
    };
  }

  const csv_validation_errors: string[] = [];
  const customers = rows.map((row, idx) => {
    if (!Platform.CSV.validate_row(row, spec)) {
      csv_validation_errors.push(
        `Row ${idx + 1} contains non-allowed fields or missing required data.`
      );
    }

    const data = unflatten(row) as unknown as Omit<
      PGCustomerInsert,
      "project_id"
    >;

    return {
      ...data,
      project_id,
    } as PGCustomerInsert;
  });

  if (csv_validation_errors.length > 0) {
    return {
      data: null,
      error: "CSV validation error",
      details: csv_validation_errors,
    };
  }

  return {
    data: customers,
    error: null,
    details: null,
  };
}

/**
 * [insert]
 * inserting customers with user uploaded csv
 *
 * @see https://app.grida.co/docs/platform/customers/working-with-csv
 *
 * - set dryrun=1 to validate the CSV without inserting
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const { project_id } = await params;
  const cookieStore = await cookies();
  const formdata = await request.formData();
  const searchParams = request.nextUrl.searchParams;
  const dryrun = qboolean(searchParams.get("dryrun"));
  const supabase = createRouteHandlerWorkspaceClient(cookieStore);
  const csvf = formdata.get("csv") as File;
  assert(csvf, "CSV file is required");

  const {
    data,
    error: parse_error,
    details,
  } = await parse_customers_csv(csvf, project_id, Platform.Customer.insert);

  if (parse_error) {
    return NextResponse.json({ error: parse_error, details }, { status: 400 });
  }

  if (dryrun) {
    return NextResponse.json({ message: "CSV is valid" });
  } else {
    console.log("inserting", data);
    const { count, error } = await supabase
      .from("customer")
      .insert(data!, { count: "exact" })
      .select("uid");

    if (error) {
      return NextResponse.json(
        { error: "Failed to insert customers", details: error },
        { status: 400 }
      );
    }

    return NextResponse.json({ message: "Customers inserted", count, data });
  }
}

/**
 * [update]
 * updating customers with user uploaded csv
 *
 * @see https://app.grida.co/docs/platform/customers/working-with-csv
 *
 * - set dryrun=1 to validate the CSV without inserting
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const { project_id } = await params;
  const cookieStore = await cookies();
  const formdata = await request.formData();
  const searchParams = request.nextUrl.searchParams;
  const dryrun = qboolean(searchParams.get("dryrun"));
  const supabase = createRouteHandlerWorkspaceClient(cookieStore);
  const csvf = formdata.get("csv") as File;
  assert(csvf, "CSV file is required");

  const {
    data,
    error: parse_error,
    details,
  } = await parse_customers_csv(csvf, project_id, Platform.Customer.update);

  if (parse_error) {
    return NextResponse.json({ error: parse_error, details }, { status: 400 });
  }

  // the bulk [update] can be done with [upsert]
  // to prevent any mistakes, we will double check if the `uuid` is present in all data.

  const uuid_ok = data!.every((row) => row.uuid);

  if (!uuid_ok) {
    return NextResponse.json(
      { error: "Missing `uuid` in some rows", details: null },
      { status: 400 }
    );
  }

  if (dryrun) {
    return NextResponse.json({ message: "CSV is valid" });
  } else {
    console.log("upserting", data);
    const { count, error } = await supabase
      .from("customer")
      .upsert(data!, { count: "exact" })
      .select("uid");

    if (error) {
      return NextResponse.json(
        { error: "Failed to insert customers", details: error },
        { status: 400 }
      );
    }

    return NextResponse.json({ message: "Customers inserted", count, data });
  }
}
