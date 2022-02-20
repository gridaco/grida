import firebase from "firebase/app";

import { analytics } from "utils/firebase";

// ------------------------------------
let a: firebase.analytics.Analytics | undefined;
try {
  a = analytics();
} catch (e) {
  console.warn(
    "analytics not available - this can happen in dev mode (and you are a contributor)",
  );
}
// ------------------------------------

function safelyLogEvent<T extends string>(
  eventName: firebase.analytics.CustomEventName<T>,
  eventParams?: { [key: string]: any },
  options?: firebase.analytics.AnalyticsCallOptions,
): void {
  if (process.env.NODE_ENV === "development") {
    console.log("logevent", eventName, eventParams, options);
  }
  if (a) {
    a.logEvent(eventName, eventParams, options);
  }
}

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

export function event_click_header_menu({ menu }: { menu: string }) {
  safelyLogEvent("click_header_menu", {
    menu: menu,
  });
}

export function event_click_footer_menu({ menu }: { menu: string }) {
  safelyLogEvent("click_footer_menu", {
    menu: menu,
  });
}

export function event_cta__to_code({
  input,
  origin,
  step,
}: {
  input: string;
  origin: "hero-cta" | "footer-cta";
  step: "input-and-validate" | "authenticate-with-figma" | "submit-and-move";
}) {
  // CONVERSION
  safelyLogEvent(
    "cta__to_code",
    {
      input: input,
      origin: origin,
      step: step,
    },
    {
      global: true,
    },
  );

  // conversion tracking
  try {
    // <script>
    //   gtag('event', 'conversion', {'send_to': 'AW-922132529/w4qwCNbTlogDELHA2rcD'});
    // </script>
    a.logEvent("conversion", { send_to: "AW-922132529/w4qwCNbTlogDELHA2rcD" });
  } catch (e) {
    console.warn("analytics not available - this can happen in dev mode");
  }
}
