import { Resend } from "resend";
import { config } from "../../config";

class DeadlineResend extends Resend {
  override fetchRequest<T>(path: string, options: RequestInit = {}) {
    const timeout = AbortSignal.timeout(15_000);
    return super.fetchRequest<T>(path, {
      ...options,
      signal: options.signal
        ? AbortSignal.any([options.signal, timeout])
        : timeout,
    });
  }
}
let client: DeadlineResend | undefined;
export const resend = {
  get emails() {
    return (client ??= new DeadlineResend(config.required("RESEND_API_KEY")))
      .emails;
  },
};
