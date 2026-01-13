import { service_role } from "@/lib/supabase/server";
import type { PostgrestError } from "@supabase/supabase-js";

export type ChallengeEmailState =
  | "idle"
  | "challenge-session-started"
  | "challenge-expired"
  | "challenge-failed"
  | "challenge-success"
  | "error";

export type ChallengeEmailSessionState = {
  state: ChallengeEmailState;
  email: string | null;
  challenge_id: string | null;
  expires_at: string | null;
  verified_at: string | null;
  customer_uid: string | null;
};

export type ChallengeEmailContext = {
  session: {
    id: string;
    form_id: string;
    raw: Record<string, unknown> | null;
    customer_id: string | null;
  };
  field: {
    id: string;
    form_id: string;
    name: string;
    type: string;
    required: boolean;
  };
  form: {
    id: string;
    project_id: number;
  };
};

export function challengeEmailStateKey(fieldId: string) {
  return `__challenge_email__${fieldId}`;
}

export function normalizeEmail(email: string) {
  return String(email).trim().toLowerCase();
}

export async function loadChallengeEmailContext({
  sessionId,
  fieldId,
}: {
  sessionId: string;
  fieldId: string;
}): Promise<
  | { data: ChallengeEmailContext; error: null }
  | { data: null; error: PostgrestError | Error }
> {
  const { data: session, error: sessionErr } = await service_role.forms
    .from("response_session")
    .select("id, form_id, raw, customer_id")
    .eq("id", sessionId)
    .single();

  if (sessionErr || !session) {
    return {
      data: null,
      error: sessionErr ?? new Error("session not found"),
    };
  }

  const { data: field, error: fieldErr } = await service_role.forms
    .from("attribute")
    .select("id, form_id, name, type, required")
    .eq("id", fieldId)
    .single();

  if (fieldErr || !field) {
    return {
      data: null,
      error: fieldErr ?? new Error("field not found"),
    };
  }

  if (field.form_id !== session.form_id) {
    return {
      data: null,
      error: new Error("field does not belong to session form"),
    };
  }

  const { data: form, error: formErr } = await service_role.forms
    .from("form")
    .select("id, project_id")
    .eq("id", session.form_id)
    .single();

  if (formErr || !form) {
    return {
      data: null,
      error: formErr ?? new Error("form not found"),
    };
  }

  return {
    data: {
      session: {
        id: session.id,
        form_id: session.form_id,
        raw: (session.raw as Record<string, unknown> | null) ?? null,
        customer_id: session.customer_id,
      },
      field: {
        id: field.id,
        form_id: field.form_id,
        name: field.name,
        type: field.type,
        required: field.required,
      },
      form: {
        id: form.id,
        project_id: Number(form.project_id),
      },
    },
    error: null,
  };
}

export function readChallengeStateFromRaw(
  raw: Record<string, unknown> | null,
  key: string
): ChallengeEmailSessionState {
  const v = raw?.[key];
  if (!v || typeof v !== "object") {
    return {
      state: "idle",
      email: null,
      challenge_id: null,
      expires_at: null,
      verified_at: null,
      customer_uid: null,
    };
  }

  const obj = v as Partial<ChallengeEmailSessionState>;
  const state = obj.state ?? "idle";
  return {
    state,
    email: obj.email ?? null,
    challenge_id: obj.challenge_id ?? null,
    expires_at: obj.expires_at ?? null,
    verified_at: obj.verified_at ?? null,
    customer_uid: obj.customer_uid ?? null,
  };
}
