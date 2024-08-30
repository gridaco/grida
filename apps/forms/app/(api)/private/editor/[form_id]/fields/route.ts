import { FieldSupports } from "@/k/supported_field_types";
import {
  grida_commerce_client,
  createRouteHandlerClient,
} from "@/lib/supabase/server";
import { GridaCommerceClient } from "@/services/commerce";
import assert from "assert";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";
import type { FormFieldUpsert } from "@/types/private/api";
import type {
  FormFieldDataSchema,
  FormInputType,
  PaymentFieldData,
} from "@/types";

export const revalidate = 0;

export async function POST(
  req: NextRequest,
  context: {
    params: {
      form_id: string;
    };
  }
) {
  const { form_id } = context.params;
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient(cookieStore);
  const init = (await req.json()) as FormFieldUpsert;
  const operation = init.id ? "update" : "create";

  assert(form_id, "form_id is required");
  assert(form_id === init.form_id, "form_id mismatch");
  // console.log("POST /private/editor/fields", init);

  const is_options_allowed_for_this_field = FieldSupports.options(init.type);

  // validate options - remove if not allowed
  if (!is_options_allowed_for_this_field) {
    delete init.options;
  }

  const { data: form_reference } = await supabase
    .from("form")
    .select(`project_id, store_connection:connection_commerce_store(*)`)
    .eq("id", form_id)
    .single();

  if (!form_reference) {
    return notFound();
  }

  const { data: upserted, error } = await supabase
    .from("form_field")
    .upsert({
      id: init.id,
      form_id: form_id,
      type: init.type,
      name: init.name,
      label: init.label,
      placeholder: init.placeholder,
      help_text: init.help_text,
      required: init.required,
      readonly: init.readonly,
      pattern: init.pattern,
      step: init.step,
      min: init.min,
      max: init.max,
      autocomplete: init.autocomplete,
      data: safe_data_field({
        type: init.type,
        data: init.data as any,
      }) as any,
      accept: init.accept,
      multiple: init.multiple,
      storage: init.storage ?? null,
      reference: init.reference ?? null,
      v_value: init.v_value ?? null,
      // 'description': init.description,
    })
    .select(
      `
        *,
        existing_options:form_field_option(*),
        existing_optgroups:optgroup(*)
      `
    )
    .single();

  // console.log("upserted", upserted, init.data);

  if (error) {
    console.error("ERR: while upserting field", error);
    return NextResponse.json(
      {
        message: `Failed to ${operation} field`,
        error: error,
        request: {
          data: init,
        },
      },
      {
        status: 400,
      }
    );
  }

  const { id: form_field_id, existing_optgroups, existing_options } = upserted;
  const { optgroups, options, options_inventory } = init;

  //
  // #region handle optgroups
  //
  const { remove: deleting_optgroups } = itemsdiff(
    optgroups ?? [],
    existing_optgroups ?? [],
    "id"
  );
  const deleting_optgroup_ids = deleting_optgroups.map((o) => o.id);

  const { remove: deleting_options } = itemsdiff(
    options ?? [],
    existing_options ?? [],
    "id"
  );
  const deleting_option_ids = deleting_options.map((o) => o.id);

  // upsert optgroups
  // upserted & inserted optgroups (for response)
  const upserted_optgroups: any[] = [];
  // input id (draftid | db id) -> db id
  const upserted_optgroups_id_map = new Map<string, string>();
  if (optgroups) {
    // keeping optgroups
    const { data: upserted, error: upsertion_err } = await supabase
      .from("optgroup")
      .upsert(
        optgroups.map((optgroup) => ({
          id: existing_optgroups.find((o) => o.id === optgroup.id)?.id,
          label: optgroup.label ?? "Group",
          index: optgroup.index,
          disabled: optgroup.disabled ?? false,
          form_field_id: form_field_id,
          form_id: form_id,
        })),
        {
          defaultToNull: false,
        }
      )
      .select();

    if (upsertion_err) {
      console.error("ERR: optgroup upsertion", error);
      return NextResponse.error();
    }

    // map the upserted optgroups
    upserted?.forEach((upserted) => {
      const original = optgroups.find(
        (optgroup) =>
          // find by id if old,
          optgroup.id === upserted.id ||
          // other wise find by index (new)
          optgroup.index === upserted.index
      );
      if (original) {
        upserted_optgroups_id_map.set(original.id, upserted.id);
      }
    });

    // push to upserted optgroups
    upserted_optgroups.push(...upserted);
  }

  let upserted_options: any[] | undefined = undefined;

  if (options) {
    const { data: options_upsert, error } = await supabase
      .from("form_field_option")
      .upsert(
        options.map((option) => ({
          // use the id if this is old, otherwise it will be generated
          id: existing_options.find((o) => o.id === option.id)?.id,
          label: option.label,
          value: option.value,
          src: option.src,
          disabled: option.disabled,
          index: option.index ?? 0,
          form_field_id: form_field_id,
          form_id: form_id,
          optgroup_id: option.optgroup_id
            ? upserted_optgroups_id_map.get(option.optgroup_id)
            : null,
        })),
        {
          defaultToNull: false,
        }
      )
      .select();

    upserted_options = options_upsert ?? undefined;

    if (error) {
      console.error("ERR: while upserting field options", error);
      console.info("failed options payload", init.options);
      if (operation === "create") {
        // revert field if options failed
        await supabase.from("form_field").delete().eq("id", upserted.id);
      } else {
        // just let only the options fail, keep the updated field
      }
      return NextResponse.error();
    }
  }

  //
  // #region clean options & optgroups
  //

  // delete removed optgroups
  if (deleting_optgroup_ids?.length) {
    console.log("removing_option_ids", deleting_optgroup_ids);
    await supabase.from("optgroup").delete().in("id", deleting_optgroup_ids);
  }

  // delete removed options
  if (deleting_option_ids?.length) {
    console.log("removing_option_ids", deleting_option_ids);
    await supabase
      .from("form_field_option")
      .delete()
      .in("id", deleting_option_ids);
  }

  // #endregion

  // handle inventory update if any
  if (options_inventory) {
    // At this moment, we only support single option for single product,
    // as following we consider the field with options and options inventory enabled as a product.

    assert(options, "options are required to update inventory");
    assert(form_reference.store_connection, "store_connection is required");

    const commerce = new GridaCommerceClient(
      grida_commerce_client,
      form_reference.project_id,
      form_reference.store_connection.store_id
    );

    for (const inventory_item of Object.entries(options_inventory)) {
      const [sku, mut] = inventory_item;
      const { diff } = mut;
      // TODO: this needs to be in a single transaction (otherwise, some would update and some would not)
      const { error: inventory_upsertion_error } =
        await commerce.upsertInventoryItem({
          sku,
          level: { diff, reason: "admin" },
          config: {
            upsert: true,
            // TODO: need a ui to toggle this.
            allow_negative_inventory: false,
          },
        });

      if (inventory_upsertion_error) console.log(inventory_upsertion_error);

      assert(!error, "failed to update inventory");
    }

    // TODO: product is not supported at the moment (only inventory)
    // const { data: product } = await commerce.upsertProduct({
    //   name: init.name,
    //   sku: upserted.id,
    //   options: {
    //     // updating the name will reset the options
    //     [upserted.name]: options.map((option) => option.value),
    //   },
    // });

    // assert(product, "failed to upsert product with options");
  }

  return NextResponse.json(
    {
      data: {
        ...upserted,
        options: upserted_options,
        optgroups: upserted_optgroups,
      },
      message: `Field ${operation}d`,
      info: {
        deleted_options: deleting_option_ids,
      },
    },
    {
      status: operation === "create" ? 201 : 200,
    }
  );
}

function itemsdiff<T>(
  current: T[],
  previous: T[],
  key: keyof T
): {
  add: T[];
  keep: T[];
  remove: T[];
} {
  const previous_keys = previous.map((r) => r[key]);
  const current_keys = current.map((r) => r[key]);
  const added_keys = current_keys.filter((k) => !previous_keys.includes(k));
  const removed_keys = previous_keys.filter((k) => !current_keys.includes(k));
  // not removed and not added
  const keep_keys = current_keys.filter((k) => previous_keys.includes(k));
  return {
    add: current.filter((r) => added_keys.includes(r[key])),
    remove: previous.filter((r) => removed_keys.includes(r[key])),
    keep: current.filter((r) => keep_keys.includes(r[key])),
  };
}

/**
 * this function ensures that dynamic json data is structured correctly by the field type
 * @returns
 */
function safe_data_field({
  type,
  data,
}: {
  type: FormInputType;
  data?: FormFieldDataSchema;
}): FormFieldDataSchema | undefined | null {
  switch (type) {
    case "payment": {
      // TODO: enhance the schema validation with external libraries
      if (!data || !(data as PaymentFieldData).type) {
        return <PaymentFieldData>{
          type: "payment",
          service_provider: "stripe",
        };
      }
      break;
    }
  }

  return data;
}

function omit<T extends Record<string, any>>(
  obj: T,
  ...keys: string[]
): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([key]) => !keys.includes(key))
  ) as Partial<T>;
}
