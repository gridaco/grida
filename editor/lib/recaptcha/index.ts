import assert from "assert";

const MAYBE_RECAPTHA_SECRET_KEY = process.env.RECAPTHA_SECRET_KEY as
  | string
  | undefined;

export interface RecaptchaSiteVerifyResponse {
  success: boolean;
  challenge_ts: string;
  hostname: string;
  "error-codes": string[];
}

/**
 *
 * @see https://developers.google.com/recaptcha/docs/verify
 * @param response the response token from the client
 * @param secretKey the secret key for the recaptcha
 * @returns
 */
export async function siteverify(
  response: string,
  secretKey: string | undefined = MAYBE_RECAPTHA_SECRET_KEY
): Promise<RecaptchaSiteVerifyResponse> {
  assert(secretKey, "RECAPTHA_SECRET_KEY is not set");

  const verificationUrl =
    "https://www.google.com/recaptcha/api/siteverify?secret=" +
    secretKey +
    "&response=" +
    response;

  return await fetch(verificationUrl, {
    method: "POST",
  }).then((response) => response.json());
}
