"use client";

import * as React from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import { CheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Env } from "@/env";
import { Spinner } from "@/components/ui/spinner";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";

export type EmailChallengeI18n = {
  verify: string;
  sending: string;
  verify_code: string;
  enter_verification_code: string;
  code_sent: string;
  didnt_receive_code: string;
  resend: string;
  retry: string;
  code_expired: string;
  incorrect_code: string;
  error_occurred: string;
};

const defaultEmailChallengeI18nEn: EmailChallengeI18n = {
  verify: "Verify",
  sending: "Sending",
  verify_code: "Verify",
  enter_verification_code: "Enter verification code",
  code_sent: "A verification code has been sent to your inbox.",
  didnt_receive_code: "Didn't receive a code?",
  resend: "Resend",
  retry: "Retry",
  code_expired: "Verification code has expired.",
  incorrect_code: "Incorrect verification code. Please try again.",
  error_occurred: "An error occurred. Please try again later.",
};

/**
 * Email challenge state type
 */
export type EmailChallengeState =
  | "idle"
  | "challenge-session-started"
  | "challenge-expired"
  | "challenge-failed"
  | "challenge-success"
  | "error";

export type EmailChallengeSessionState = {
  state: EmailChallengeState;
  email: string | null;
  challenge_id: string | null;
  expires_at: string | null;
  verified_at: string | null;
  customer_uid: string | null;
};

export type EmailChallengeProvider = {
  getState(args: {
    sessionId: string;
    fieldId: string;
  }): Promise<EmailChallengeSessionState>;
  start(args: {
    sessionId: string;
    fieldId: string;
    email: string;
  }): Promise<EmailChallengeSessionState>;
  verify(args: {
    sessionId: string;
    fieldId: string;
    challengeId: string;
    otp: string;
  }): Promise<EmailChallengeSessionState>;
};

const EmailChallengeProviderContext =
  React.createContext<EmailChallengeProvider | null>(null);

export function EmailChallengeProvider({
  provider,
  children,
}: React.PropsWithChildren<{ provider: EmailChallengeProvider }>) {
  return (
    <EmailChallengeProviderContext.Provider value={provider}>
      {children}
    </EmailChallengeProviderContext.Provider>
  );
}

export function createHttpEmailChallengeProvider({
  base = `${Env.web.HOST}/v1`,
}: {
  /**
   * Base URL for the public v1 API. Defaults to `${Env.web.HOST}/v1`.
   * Using the canonical host is important because some renderers can run on
   * non-API origins (e.g. embeds/custom domains).
   */
  base?: string;
}): EmailChallengeProvider {
  async function json<T>(res: Response): Promise<T> {
    const t = await res.json().catch(() => null);
    if (!res.ok) {
      const msg =
        (t && typeof t === "object" && "error" in t && (t as any).error) ||
        `Request failed (${res.status})`;
      throw new Error(String(msg));
    }
    return t as T;
  }

  return {
    async getState({ sessionId, fieldId }) {
      const res = await fetch(
        `${base}/session/${encodeURIComponent(sessionId)}/field/${encodeURIComponent(
          fieldId
        )}/challenge/email/state`,
        { method: "GET" }
      );
      const data = await json<{ state: EmailChallengeSessionState }>(res);
      return data.state;
    },
    async start({ sessionId, fieldId, email }) {
      const res = await fetch(
        `${base}/session/${encodeURIComponent(sessionId)}/field/${encodeURIComponent(
          fieldId
        )}/challenge/email/start`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email }),
        }
      );
      const data = await json<{ state: EmailChallengeSessionState }>(res);
      return data.state;
    },
    async verify({ sessionId, fieldId, challengeId, otp }) {
      const res = await fetch(
        `${base}/session/${encodeURIComponent(sessionId)}/field/${encodeURIComponent(
          fieldId
        )}/challenge/email/verify`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ challenge_id: challengeId, otp }),
        }
      );
      const data = await json<{ state: EmailChallengeSessionState }>(res);
      return data.state;
    },
  };
}

/**
 * Demo-only provider for preview/story/demo contexts.
 * Not secure; does not actually send or verify OTP.
 */
export function createDemoEmailChallengeProvider(): EmailChallengeProvider {
  const store = new Map<string, EmailChallengeSessionState>();
  const keyOf = (sessionId: string, fieldId: string) =>
    `${sessionId}:${fieldId}`;

  function getOrInit(
    sessionId: string,
    fieldId: string
  ): EmailChallengeSessionState {
    const k = keyOf(sessionId, fieldId);
    const v = store.get(k);
    if (v) return v;
    const init: EmailChallengeSessionState = {
      state: "idle",
      email: null,
      challenge_id: null,
      expires_at: null,
      verified_at: null,
      customer_uid: null,
    };
    store.set(k, init);
    return init;
  }

  return {
    async getState({ sessionId, fieldId }) {
      return getOrInit(sessionId, fieldId);
    },
    async start({ sessionId, fieldId, email }) {
      const next: EmailChallengeSessionState = {
        ...getOrInit(sessionId, fieldId),
        state: "challenge-session-started",
        email,
        challenge_id: `demo_${Math.random().toString(16).slice(2)}`,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        verified_at: null,
        customer_uid: null,
      };
      store.set(keyOf(sessionId, fieldId), next);
      return next;
    },
    async verify({ sessionId, fieldId }) {
      const next: EmailChallengeSessionState = {
        ...getOrInit(sessionId, fieldId),
        state: "challenge-success",
        verified_at: new Date().toISOString(),
        customer_uid: "demo_customer_uid",
      };
      store.set(keyOf(sessionId, fieldId), next);
      return next;
    },
  };
}

/**
 * Core reusable email challenge widget (stateless).
 * Handles rendering of email input, send button, and OTP verification UI.
 */
function _EmailChallenge({
  state,
  id,
  name,
  placeholder,
  required,
  disabled,
  sendPending,
  i18n,
  verifyPending,
  email,
  otp,
  canSend,
  otpLength,
  otpType,
  onEmailChange,
  onOtpChange,
  onSendClick,
  onVerifyClick,
  onResendClick,
}: {
  state: EmailChallengeState;
  id?: string;
  name?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  sendPending?: boolean;
  i18n?: EmailChallengeI18n;
  verifyPending?: boolean;
  email: string;
  otp: string;
  canSend: boolean;
  otpLength?: number;
  otpType?: "text" | "numeric";
  onEmailChange: (value: string) => void;
  onOtpChange: (value: string) => void;
  onSendClick: () => void;
  onVerifyClick?: () => void;
  onResendClick?: () => void;
}) {
  const t = i18n ?? defaultEmailChallengeI18nEn;
  // Derive showOtp from state
  const showOtp =
    state === "challenge-session-started" ||
    state === "challenge-expired" ||
    state === "challenge-failed" ||
    state === "error";

  const canVerify =
    !disabled &&
    !!onVerifyClick &&
    !!otp &&
    (otpLength !== undefined ? otp.length === otpLength : true);

  const autoVerifyEnabled = otpLength !== undefined;
  return (
    <div data-slot="email-challenge" data-state={state} className="space-y-3">
      <InputGroup data-disabled={disabled ? "true" : undefined}>
        {/* Browser-side submit gating (hidden inputs do not validate).
            This blocks native HTML form submission until the verification succeeds. */}
        {required ? (
          <input
            type="text"
            required
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            value={state === "challenge-success" && !!email ? "verified" : ""}
            onChange={() => {
              // no-op: controlled input used only for native form validation gating
            }}
            className="sr-only"
          />
        ) : null}
        <InputGroupInput
          id={id}
          // NOTE: `name` makes this the "real" field value submitted with the form.
          name={name}
          type="email"
          value={email}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          readOnly={state === "challenge-success"}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            // Avoid accidental full-form submit; treat as "subform".
            e.preventDefault();
            e.stopPropagation();

            if (state === "idle") {
              if (canSend) onSendClick();
              return;
            }

            if (showOtp && canVerify) {
              onVerifyClick?.();
              return;
            }
          }}
          onChange={(e) => onEmailChange(e.target.value)}
        />
        {state === "idle" && (
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              disabled={!canSend || !!sendPending}
              onClick={onSendClick}
            >
              {sendPending ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner className="h-4 w-4" />
                  {t.sending}
                </span>
              ) : (
                // user-facing: "Verify" is more natural than "Send"
                t.verify
              )}
            </InputGroupButton>
          </InputGroupAddon>
        )}
        {state === "challenge-success" && (
          <InputGroupAddon align="inline-end">
            <CheckIcon className="h-4 w-4 text-green-600" />
          </InputGroupAddon>
        )}
      </InputGroup>

      {showOtp && (
        <div
          className="space-y-2"
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            // Avoid accidental full-form submit; treat as "subform".
            e.preventDefault();
            e.stopPropagation();
            if (canVerify) {
              onVerifyClick?.();
            }
          }}
        >
          {/* Ephemeral input: no `name` so it won't be submitted */}
          <div className="flex items-center gap-3">
            {otpLength !== undefined ? (
              <InputOTP
                maxLength={otpLength}
                value={otp}
                onChange={onOtpChange}
                inputMode={otpType === "numeric" ? "numeric" : "text"}
                disabled={disabled}
                className={
                  state === "challenge-failed" || state === "error"
                    ? "border-red-500 focus-within:ring-red-500"
                    : ""
                }
              >
                <InputOTPGroup>
                  {Array.from({ length: otpLength }, (_, index) => (
                    <InputOTPSlot key={index} index={index} />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            ) : (
              <Input
                type={otpType === "numeric" ? "number" : "text"}
                value={otp}
                onChange={(e) => onOtpChange(e.target.value)}
                placeholder={t.enter_verification_code}
                disabled={disabled}
                className={`flex-1 ${
                  state === "challenge-failed" || state === "error"
                    ? "border-red-500 focus-visible:ring-red-500"
                    : ""
                }`}
              />
            )}

            {autoVerifyEnabled ? (
              // When OTP length is known, verification is auto-triggered.
              // Keep a small slot for consistent layout.
              <div className="w-12 flex items-center justify-center">
                {verifyPending ? <Spinner className="h-4 w-4" /> : null}
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                disabled={!canVerify || !!verifyPending}
                onClick={onVerifyClick}
              >
                {t.verify_code}
              </Button>
            )}
          </div>

          <div className="text-xs text-muted-foreground">
            {state === "challenge-expired" ? (
              <>
                {t.code_expired} {t.didnt_receive_code}{" "}
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0 text-xs underline cursor-pointer"
                  disabled={disabled}
                  onClick={() => {
                    onResendClick?.();
                  }}
                >
                  {t.resend}
                </Button>
              </>
            ) : state === "challenge-failed" ? (
              <>
                <span className="text-red-600">{t.incorrect_code}</span>{" "}
                {t.didnt_receive_code}{" "}
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0 text-xs underline cursor-pointer"
                  disabled={disabled}
                  onClick={() => {
                    onResendClick?.();
                  }}
                >
                  {t.resend}
                </Button>
              </>
            ) : state === "error" ? (
              <>
                <span className="text-red-600">{t.error_occurred}</span>{" "}
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0 text-xs underline cursor-pointer"
                  disabled={disabled}
                  onClick={() => {
                    onResendClick?.();
                  }}
                >
                  {t.retry}
                </Button>
              </>
            ) : (
              <>
                {t.code_sent} {t.didnt_receive_code}{" "}
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0 text-xs underline cursor-pointer"
                  disabled={disabled}
                  onClick={() => {
                    onResendClick?.();
                  }}
                >
                  {t.resend}
                </Button>
              </>
            )}
          </div>

          {/* Fallback hidden input to avoid accidental submit (no name) */}
          <Input type="hidden" value={otp} />
        </div>
      )}
    </div>
  );
}

/**
 * Email challenge component for functional forms.
 *
 * - Renders an email input (submittable: uses `name`)
 * - Renders a "Send" button (disappears when clicked)
 * - Renders an OTP input when sent (ephemeral: no `name`, not submitted)
 * - Shows check icon when verification is successful
 */
export function EmailChallenge({
  state,
  name,
  label,
  placeholder,
  required,
  requiredAsterisk = true,
  disabled,
  otpLength,
  otpType,
  onResendClick,
  onVerify,
}: {
  state: EmailChallengeState;
  name?: string;
  label?: string;
  placeholder?: string;
  required?: boolean;
  requiredAsterisk?: boolean;
  disabled?: boolean;
  otpLength?: number;
  otpType?: "text" | "numeric";
  onResendClick?: () => void;
  onVerify?: () => void;
}) {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");

  const canSend = useMemo(() => {
    if (disabled) return false;
    // intentionally loose validation (placeholder)
    return email.trim().length > 0 && email.includes("@");
  }, [disabled, email]);

  const handleSendClick = () => {
    // This should trigger parent to update state to "challenge-session-started"
    // For now, this is a placeholder
  };

  const handleResendClick = () => {
    onResendClick?.();
    setOtp("");
  };

  return (
    <_EmailChallenge
      state={state}
      id={undefined}
      name={name}
      placeholder={placeholder}
      required={required}
      disabled={disabled}
      sendPending={false}
      i18n={defaultEmailChallengeI18nEn}
      email={email}
      otp={otp}
      canSend={canSend}
      otpLength={otpLength}
      otpType={otpType}
      onEmailChange={setEmail}
      onOtpChange={setOtp}
      onSendClick={handleSendClick}
      onVerifyClick={() => {
        onVerify?.();
        // State should be updated by parent component
      }}
      onResendClick={handleResendClick}
    />
  );
}

/**
 * Stateful `challenge_email` field controller.
 * Requires session context to work (via sessionId + fieldId + provider).
 */
export function ChallengeEmailField({
  sessionId,
  fieldId,
  stateKey,
  id,
  name,
  placeholder,
  required,
  requiredAsterisk = true,
  disabled,
  otpLength = 6,
  otpType = "numeric",
  i18n,
}: {
  sessionId?: string;
  fieldId?: string;
  /**
   * Optional stable session key for demo usage when fieldId is not available.
   */
  stateKey?: string;
  /** Associate with parent label via htmlFor when rendered inside FormField. */
  id?: string;
  name?: string;
  placeholder?: string;
  required?: boolean;
  requiredAsterisk?: boolean;
  disabled?: boolean;
  otpLength?: number;
  otpType?: "text" | "numeric";
  i18n?: EmailChallengeI18n;
}) {
  const provided = React.useContext(EmailChallengeProviderContext);
  const provider = useMemo(() => {
    // If no provider is given, we fall back to demo-only behavior.
    // Real FormView and custom renderers should wrap with EmailChallengeProvider.
    return provided ?? createDemoEmailChallengeProvider();
  }, [provided]);

  const effectiveSessionId =
    sessionId ?? `demo_session_${stateKey ?? "unknown"}`;
  const effectiveFieldId = fieldId ?? `demo_field_${stateKey ?? "unknown"}`;

  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [sendPending, setSendPending] = useState(false);
  const [verifyPending, setVerifyPending] = useState(false);
  const [sessionState, setSessionState] = useState<EmailChallengeSessionState>({
    state: "idle",
    email: null,
    challenge_id: null,
    expires_at: null,
    verified_at: null,
    customer_uid: null,
  });

  const widgetState: EmailChallengeState = sessionState.state;

  // Auto-verify when OTP reaches the expected length.
  const lastAutoVerifyOtpRef = useRef<string | null>(null);
  React.useEffect(() => {
    if (otpLength === undefined) return;
    if (verifyPending) return;
    if (!sessionState.challenge_id) return;
    if (widgetState === "challenge-expired") return;
    if (otp.length !== otpLength) return;
    if (lastAutoVerifyOtpRef.current === otp) return;
    lastAutoVerifyOtpRef.current = otp;
    void onVerifyClick();
  }, [otp, otpLength, verifyPending, sessionState.challenge_id, widgetState]);

  React.useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const s = await provider.getState({
          sessionId: effectiveSessionId,
          fieldId: effectiveFieldId,
        });
        if (cancelled) return;
        setSessionState(s);
        if (s.email && !email) setEmail(s.email);
      } catch {
        if (cancelled) return;
        setSessionState((prev) => ({ ...prev, state: "error" }));
      }
    };
    run();
    return () => {
      cancelled = true;
    };
    // intentionally omit `email` from deps: we only want to hydrate once
  }, [provider, effectiveSessionId, effectiveFieldId]);

  const canSend = useMemo(() => {
    if (disabled) return false;
    return email.trim().length > 0 && email.includes("@");
  }, [disabled, email]);

  const onSendClick = useCallback(async () => {
    if (sendPending) return;
    setSendPending(true);
    try {
      const next = await provider.start({
        sessionId: effectiveSessionId,
        fieldId: effectiveFieldId,
        email,
      });
      setSessionState(next);
      setOtp("");
    } catch {
      setSessionState((prev) => ({ ...prev, state: "error" }));
    } finally {
      setSendPending(false);
    }
  }, [provider, effectiveSessionId, effectiveFieldId, email, sendPending]);

  const onVerifyClick = useCallback(async () => {
    const challengeId = sessionState.challenge_id;
    if (!challengeId) {
      setSessionState((prev) => ({ ...prev, state: "challenge-expired" }));
      return;
    }
    if (verifyPending) return;
    setVerifyPending(true);
    try {
      const next = await provider.verify({
        sessionId: effectiveSessionId,
        fieldId: effectiveFieldId,
        challengeId,
        otp,
      });
      setSessionState(next);
    } catch {
      setSessionState((prev) => ({ ...prev, state: "challenge-failed" }));
    } finally {
      setVerifyPending(false);
    }
  }, [
    provider,
    effectiveSessionId,
    effectiveFieldId,
    otp,
    sessionState.challenge_id,
    verifyPending,
  ]);

  const onResendClick = useCallback(() => {
    void onSendClick();
  }, [onSendClick]);

  return (
    <_EmailChallenge
      state={widgetState}
      id={id}
      name={name}
      placeholder={placeholder}
      required={required}
      disabled={disabled}
      sendPending={sendPending}
      verifyPending={verifyPending}
      i18n={i18n}
      email={email}
      otp={otp}
      canSend={canSend}
      otpLength={otpLength}
      otpType={otpType}
      onEmailChange={setEmail}
      onOtpChange={setOtp}
      onSendClick={onSendClick}
      onVerifyClick={onVerifyClick}
      onResendClick={onResendClick}
    />
  );
}

/**
 * Email challenge preview component for design/preview purposes.
 *
 * - Always shows both email input and OTP input
 * - Renders all UI states for preview purposes
 * - Internally manages state for demo purposes
 */
export function EmailChallengePreview({
  id,
  name,
  placeholder,
  required,
  requiredAsterisk = true,
  disabled,
  otpLength,
  otpType,
  onResendClick,
  onVerify,
}: {
  /** Associate with parent label via htmlFor when used inside FormField. */
  id?: string;
  name?: string;
  placeholder?: string;
  required?: boolean;
  requiredAsterisk?: boolean;
  disabled?: boolean;
  otpLength?: number;
  otpType?: "text" | "numeric";
  onResendClick?: () => void;
  onVerify?: () => void;
}) {
  const [email, setEmail] = useState("");
  const [internalState, setInternalState] =
    useState<EmailChallengeState>("idle");
  const [otp, setOtp] = useState("");

  const canSend = useMemo(() => {
    if (disabled) return false;
    // intentionally loose validation (placeholder)
    return email.trim().length > 0 && email.includes("@");
  }, [disabled, email]);

  const handleSendClick = () => {
    // For demo: transition to challenge-session-started
    setInternalState("challenge-session-started");
  };

  const handleResendClick = () => {
    onResendClick?.();
    setInternalState("challenge-session-started");
    setOtp("");
  };

  const handleVerifyClick = () => {
    onVerify?.();
    // For demo: transition to challenge-success
    setInternalState("challenge-success");
  };

  return (
    <_EmailChallenge
      state={internalState}
      id={id}
      name={name}
      placeholder={placeholder}
      required={required}
      disabled={disabled}
      sendPending={false}
      i18n={defaultEmailChallengeI18nEn}
      email={email}
      otp={otp}
      canSend={canSend}
      otpLength={otpLength}
      otpType={otpType}
      onEmailChange={setEmail}
      onOtpChange={setOtp}
      onSendClick={handleSendClick}
      onVerifyClick={handleVerifyClick}
      onResendClick={handleResendClick}
    />
  );
}
