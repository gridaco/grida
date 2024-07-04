import { useEffect, useMemo, useState } from "react";
import { InventoryStock } from "@/types/inventory";
import { INITIAL_INVENTORY_STOCK } from "@/k/inventory_defaults";
import { GridaCommerceClient } from "@/services/commerce";
import { useEditorState } from "../editor";
import { createClientCommerceClient } from "@/lib/supabase/client";
import type { Option } from "@/types";

function useCommerceClient() {
  const [state] = useEditorState();

  const supabase = useMemo(() => createClientCommerceClient(), []);

  const commerce = useMemo(
    () =>
      new GridaCommerceClient(
        supabase,
        state.connections.project_id,
        state.connections.store_id
      ),
    [supabase, state.connections.project_id, state.connections.store_id]
  );

  return commerce;
}

export function useInventory(options: Option[]) {
  const [state] = useEditorState();
  const commerce = useCommerceClient();
  const [loading, setLoading] = useState(true);
  const [inventory, setInventory] = useState<{
    [key: string]: InventoryStock;
  } | null>(null);

  useEffect(() => {
    setLoading(true);

    if (!state.connections.store_id) {
      setLoading(false);
      return;
    }

    console.log("fetching inventory");
    commerce
      .fetchInventoryItemsRPC()
      .then(({ data, error }) => {
        if (error) console.error(error);
        if (!data) return;

        // filter out items that are not in the options list
        const filtered_data = data.filter((item) =>
          options.some((option) => option.id === item.sku)
        );

        if (filtered_data.length === 0) {
          return;
        }

        const inventorymap = options.reduce(
          (acc: { [sku: string]: InventoryStock }, option) => {
            const item = filtered_data.find((_) => _.sku === option.id);
            if (item) {
              acc[item.sku] = {
                available: item.available,
                on_hand: item.available, // TODO:
                committed: item.committed,
                unavailable: 0,
                incoming: 0,
              };
            } else {
              acc[option.id] = {
                available: 0,
                on_hand: 0,
                committed: 0,
                unavailable: 0,
                incoming: 0,
              };
            }
            return acc;
          },
          {}
        );
        setInventory(inventorymap);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [commerce, options, state.connections.store_id]);

  return { inventory, loading };
}

export function useInventoryState(
  options: Option[],
  _inventory: { [key: string]: InventoryStock } | null,
  enabled: boolean
) {
  const [inventory, setInventory] = useState<{
    [key: string]: InventoryStock;
  } | null>(_inventory);

  useEffect(() => {
    if (enabled) {
      setInventory(_inventory);

      if (!_inventory) {
        const initialmap = options.reduce(
          (acc: { [sku: string]: InventoryStock }, option) => {
            acc[option.id] = {
              available: INITIAL_INVENTORY_STOCK,
              on_hand: INITIAL_INVENTORY_STOCK,
              committed: 0,
              unavailable: 0,
              incoming: 0,
            };
            return acc;
          },
          {}
        );
        setInventory(initialmap);
      }
    }
  }, [_inventory, options, enabled]);

  return [inventory, setInventory] as const;
}
