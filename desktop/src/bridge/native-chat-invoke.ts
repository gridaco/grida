// GRIDA-SEC-004 — preserve whole native machine codes across Electron invoke.
import { IPC_CHANNELS } from "./contract";

const NATIVE_CHAT_CHANNELS = new Set<string>(
  Object.entries(IPC_CHANNELS)
    .filter(
      ([key]) =>
        key.startsWith("NATIVE_CHAT_") || key.startsWith("WELCOME_CHAT_")
    )
    .map(([, channel]) => channel)
);
const MAX_CODE_LENGTH = 128;
const MACHINE_CODE = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

/** Private preload transport adaptation; no error text is interpreted by clients. */
export namespace NativeChatInvoke {
  export async function invoke<T>(
    invoker: (channel: string, ...args: unknown[]) => Promise<T>,
    channel: string,
    ...args: unknown[]
  ): Promise<T> {
    try {
      return await invoker(channel, ...args);
    } catch (error) {
      if (NATIVE_CHAT_CHANNELS.has(channel) && error instanceof Error) {
        const prefix = `Error invoking remote method '${channel}': Error: `;
        const message = error.message;
        if (
          typeof message === "string" &&
          message.length <= prefix.length + MAX_CODE_LENGTH &&
          message.startsWith(prefix)
        ) {
          const code = message.slice(prefix.length);
          if (MACHINE_CODE.test(code)) {
            const transported = new Error(code);
            // Only the machine identity crosses; neither remote diagnostics nor
            // a preload stack/cause is needed to classify this known outcome.
            transported.stack = undefined;
            throw transported;
          }
        }
      }
      throw error;
    }
  }
}
