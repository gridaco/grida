import { analytics } from "utils/firebase";

const a = analytics();

export function event_begin_checkout(plan: "free" | "paid") {
  a.logEvent("begin_checkout", {
    currency: "usd",
    coupon: "alpha-all-free",
    items: [
      {
        item_id: `2021.0.0.${plan}`,
        item_name: `2021.0.0.${plan}`,
      },
    ],
  });
}

export function event_view_pricing() {
  a.logEvent("view_item_list", {
    item_list_name: "pricing_list",
  });
}

export function event_visit_github() {}

export function event_visit_docs() {}
