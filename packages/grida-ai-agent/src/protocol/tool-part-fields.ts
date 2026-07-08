/**
 * AI SDK tool-part field normalization. Client-safe.
 *
 * Persisted rows kept snake_case mirrors for older recorder versions; SDK UI
 * parts require camelCase. Keep the compatibility mapping in one protocol
 * helper so server-side model reconstruction and renderer hydration agree.
 */

export function normalizeSdkToolPartFields(
  data: Record<string, unknown>,
  fallbackToolCallId: string | null = null
): Record<string, unknown> {
  const toolCallId = data.toolCallId ?? data.tool_call_id ?? fallbackToolCallId;
  const out: Record<string, unknown> = { ...data };
  delete out.tool_call_id;
  delete out.tool_name;
  delete out.input_text_delta;
  delete out.error_text;
  delete out.provider_executed;
  if (typeof toolCallId === "string") out.toolCallId = toolCallId;
  if (typeof data.toolName !== "string" && typeof data.tool_name === "string") {
    out.toolName = data.tool_name;
  }
  if (
    typeof data.inputTextDelta !== "string" &&
    typeof data.input_text_delta === "string"
  ) {
    out.inputTextDelta = data.input_text_delta;
  }
  if (
    typeof data.errorText !== "string" &&
    typeof data.error_text === "string"
  ) {
    out.errorText = data.error_text;
  }
  if (
    typeof data.providerExecuted !== "boolean" &&
    typeof data.provider_executed === "boolean"
  ) {
    out.providerExecuted = data.provider_executed;
  }
  return out;
}
