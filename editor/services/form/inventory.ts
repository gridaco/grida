import { grida_commerce_client } from "@/lib/supabase/server";
import { GridaCommerceClient } from "../commerce";
import assert from "assert";
import { Option } from "@/types";
import { FORM_OPTION_UNAVAILABLE, FORM_SOLD_OUT } from "@/k/error";

export type FormFieldOptionsInventoryMap = { [sku: string]: number };

export async function form_field_options_inventory({
  project_id,
  store_id,
}: {
  project_id: number;
  store_id: number;
}): Promise<FormFieldOptionsInventoryMap> {
  const commerce = new GridaCommerceClient(
    grida_commerce_client,
    project_id,
    store_id
  );

  const { data: inventory_items } = await commerce.fetchInventoryItems();
  assert(inventory_items, "failed to fetch inventory items");

  return inventory_items.reduce((acc: { [sku: string]: number }, item) => {
    acc[item.sku] = item.available;
    return acc;
  }, {});
}

export async function validate_options_inventory({
  inventory,
  options,
  selection,
  config,
}: {
  inventory: FormFieldOptionsInventoryMap;
  // TODO: this needs to be a grouped options, so we can validate by each field (select).
  options: Option[];
  selection?: { id: string }; // TODO:
  config: {
    /**
     * How to count the available inventory for multiple options
     * - sum_all: sum all the inventory: -1 + 1 = 0
     * - sum_positive: sum only the positive inventory: -1 + 1 = 1
     */
    available_counting_strategy: "sum_all" | "sum_positive";
  };
}): Promise<null | typeof FORM_SOLD_OUT | typeof FORM_OPTION_UNAVAILABLE> {
  const used_inventory = options.reduce(
    (acc: FormFieldOptionsInventoryMap, option) => {
      if (option.id in inventory) acc[option.id] = inventory[option.id];
      return acc;
    },
    {}
  );

  // if there is no inventory used, then return null - no need to validate
  if (Object.keys(used_inventory).length === 0) {
    return null;
  }

  const available = options.reduce((acc: number, option) => {
    switch (config.available_counting_strategy) {
      case "sum_all": {
        return acc + used_inventory[option.id] || 0;
      }
      case "sum_positive": {
        return acc + Math.max(used_inventory[option.id] || 0, 0);
      }
    }
  }, 0);

  // check if sold out - if all options are sold out, then its FORM_SOLD_OUT
  const sold_out = available === 0;

  if (sold_out) {
    // TODO: add validation if its a required field.
    return FORM_SOLD_OUT;
  }

  // check if the selected item is unavailable
  if (selection?.id) {
    // TODO: add validation if its a required field.
    // check if the selection is provided (used on submission)
    if (inventory[selection.id] === 0) {
      return FORM_OPTION_UNAVAILABLE;
    }
  }

  return null;
}
