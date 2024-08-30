"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import {
  SYSTEM_GF_CUSTOMER_UUID_KEY,
  SYSTEM_GF_FINGERPRINT_VISITORID_KEY,
  SYSTEM_GF_SESSION_KEY,
} from "@/k/system";
import type { EditorApiResponse } from "@/types/private/api";
import type {
  FormClientFetchResponseData,
  FormClientFetchResponseError,
} from "@/app/(api)/v1/[id]/route";
import { Env } from "@/env";

export function useRequestFormSession(form_id: string) {
  const storekey = SYSTEM_GF_SESSION_KEY + "/" + form_id;
  const [session, set_session] = useState<string | null>(null);
  const isFetched = useRef(false);

  useEffect(() => {
    if (isFetched.current) {
      return;
    }
    isFetched.current = true;

    const windowsession = sessionStorage.getItem(storekey);
    if (windowsession) {
      set_session(windowsession);
      return;
    }

    // console.log("fetching session");
    fetch(makeurl_formsessioninit(form_id)).then((res) => {
      res.json().then(({ data }: EditorApiResponse<{ id: string }>) => {
        if (data?.id) {
          set_session(data.id);
          sessionStorage.setItem(storekey, data.id);
        }
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    session,
    clearSessionStorage: () => sessionStorage.removeItem(storekey),
  };
}

function makeurl_formsessioninit(form_id: string) {
  return Env.web.HOST + `/v1/${form_id}/session`;
}

export function makeurl_forminit({
  form_id,
  session_id,
  fingerprint,
  urlParams,
}: {
  form_id: string;
  session_id: string;
  fingerprint?: { visitorId: string };
  /**
   * pass received url params
   * only required on standalone clients
   */
  urlParams?: Record<string, string>;
}): string {
  const params: Record<string, string> = {
    ...urlParams,
    [SYSTEM_GF_SESSION_KEY]: session_id,
  };

  if (fingerprint?.visitorId) {
    // rather intended or not, this will fetch data again when fingerprint is ready (when and even when it's not required)
    params[SYSTEM_GF_FINGERPRINT_VISITORID_KEY] = fingerprint.visitorId;
  }

  return Env.web.HOST + `/v1/${form_id}?${new URLSearchParams(params)}`;
}

export function useFormSession(
  form_id: string,
  signature:
    | {
        mode: "anon";
        session_id?: string | null;
        fingerprint?: { visitorId: string };
        urlParams?: { [key: string]: string };
      }
    | {
        mode: "signed";
        session_id?: string | null;
        user_id: string;
      }
) {
  //

  let req_url: string | null = null;
  switch (signature.mode) {
    case "anon": {
      const { session_id, fingerprint, urlParams } = signature;
      const __fingerprint_ready = !!fingerprint?.visitorId;
      const __gf_customer_uuid = urlParams?.[SYSTEM_GF_CUSTOMER_UUID_KEY];

      const can_make_initial_request =
        (!!__gf_customer_uuid || __fingerprint_ready) && !!session_id;

      req_url = can_make_initial_request
        ? makeurl_forminit({
            form_id,
            session_id: session_id,
            fingerprint: __fingerprint_ready ? fingerprint : undefined,
            urlParams: urlParams,
          })
        : null;
      break;
    }
    case "signed": {
      //
      const { session_id } = signature;
      req_url = session_id
        ? makeurl_forminit({
            form_id,
            session_id: session_id,
          })
        : null;
      break;
    }
  }

  return useSWR<
    EditorApiResponse<FormClientFetchResponseData, FormClientFetchResponseError>
  >(
    req_url,
    async (url: string) => {
      const res = await fetch(url);
      return res.json();
    },
    {
      // TODO: this is expensive, consider removing with other real-time features
      // refreshInterval: 1000,
    }
  );
}
