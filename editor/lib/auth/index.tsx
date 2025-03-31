import assert from "assert";

/**
 *
 * Typings & Utilities for Dynamic Authentication
 *
 *
 * NOTE: Identifier Duplicates Handling
 *
 * When using identifiers such as email for customer authentication, keep in mind that these values may not be unique.
 * For example, in Stripe’s Customer Portal, if multiple customers share the same email address, Stripe selects the
 * most recently created customer with that email who also has an active subscription.
 *
 * Our Authentication module does not implement duplicate checking by default. It is important that:
 * 1. During customer creation, you enforce unique identifiers, OR
 * 2. At login time, you implement a duplicate resolution strategy (e.g., select the most recently created customer with an active subscription)
 *    or reject the login attempt with an appropriate message.
 *
 * This behavior should be clearly documented and handled by the application layer.
 */
export namespace Authentication {
  export type ChallengeType = Challenge["type"];

  export const CHALLENGE_TYPE_LABELS: Record<ChallengeType, string> = {
    passcode: "Passcode",
    kba: "Knowledge-Based Authentication",
    basic: "Basic Authentication",
    otp: "One-Time Password",
    "magic-link": "Magic Link",
  };

  export type Challenge =
    | PasscodeChallenge
    | BasicAuthChallenge
    | KnowledgeBaseAuthChallenge
    | OtpChallenge
    | MagicLinkChallenge;

  export type ChallengeSubmission =
    | PasscodeChallengeSubmission
    | BasicAuthChallengeSubmission
    | KnowledgeBaseAuthChallengeSubmission
    | OtpChallengeSubmission
    | MagicLinkChallengeSubmission;

  /**
   * [passcode protection] (terms may vary like 'password protection' on user facing apps.)
   * Represents a passcode challenge for static access protection.
   */
  export type PasscodeChallenge = {
    type: "passcode";
  };

  /**
   * Represents a submission for a passcode challenge.
   */
  export type PasscodeChallengeSubmission = {
    type: "passcode";
    passcode: string;
  };

  /**
   * Pre-templated server assertion for a passcode challenge.
   * This is suitable when the correct passcode is already stored and can be directly compared.
   */
  export type PasscodeAssertion = {
    type: "passcode";
    passcode: string;
  };

  /**
   * [basic auth]
   *
   * standard basic auth with username and password
   *
   * @deprecated - not used by the system. (also not recommended)
   */
  type BasicAuthChallenge = {
    type: "basic";
  };

  /**
   * Represents a submission for a basic authentication challenge.
   * @deprecated - not used by the system (also not recommended).
   */
  type BasicAuthChallengeSubmission = {
    type: "basic";
    username: string;
    password: string;
  };

  /**
   * Represents a question used in a Knowledge-Based Authentication (KBA) challenge.
   */
  type KnowledgeBaseQuestionDefinition = {
    required: boolean;
  };

  /**
   * Represents a Knowledge-Based Authentication (KBA) challenge containing an array of questions.
   *
   * @example
   * ```json
   * {
   *    "type": "kba",
   *    "identifier": "phone",
   *    "questions": {
   *      "phone": { "required": true },
   *      "email": { "required": true },
   *      "name": { "required": true }
   *    }
   * }
   * ```
   */
  type KnowledgeBaseAuthChallenge = {
    type: "kba";
    /**
     * the primary question key - identifier
     */
    identifier: string;
    questions: Record<string, KnowledgeBaseQuestionDefinition>;
  };

  /**
   * Represents a submission for a Knowledge-Based Authentication (KBA) challenge, containing an array of answers.
   */
  type KnowledgeBaseAuthChallengeSubmission = {
    type: "kba";
    identity: string;
    answers: Record<string, string>;
  };

  /**
   * Pre-templated server assertion for a Knowledge-Based Authentication (KBA) challenge.
   * The server stores expected answers for each KBA question.
   */
  export type KnowledgeBaseAssertion = {
    type: "kba";
    /**
     * the identity value (not key)
     *
     * the answers are pre-populated based on the identifier
     */
    identity: string;
    answers: Record<string, string>;
  };

  /**
   * [OTP Authentication]
   * Represents an OTP challenge where a one-time password is sent to the user.
   */
  type OtpChallenge = {
    type: "otp";
  };

  /**
   * Represents a submission for an OTP challenge.
   */
  type OtpChallengeSubmission = {
    type: "otp";
    /**
     * The OTP provided by the user.
     */
    otp: string;
  };

  /**
   * [Magic Link Authentication]
   * Represents a magic link challenge where a one-time login URL is sent to the user.
   * Note: Magic link authentication is distinct from OTP. While both are passwordless
   * and use one-time tokens, the magic link flow relies on the user clicking a link
   * (instead of manually entering a code) to authenticate.
   */
  type MagicLinkChallenge = {
    type: "magic-link";
  };

  /**
   * Represents a submission for a magic link challenge.
   */
  type MagicLinkChallengeSubmission = {
    type: "magic-link";
    /**
     * The token extracted from the magic link, which upon verification authenticates the user.
     */
    token: string;
  };

  /**
   * Verifies an authentication submission against its definition using a trusted server assertion.
   *
   * @param definition - The authentication challenge definition.
   * @param submission - The user's authentication submission.
   * @param serverAssertion - The pre-templated server assertion containing the expected data.
   *                          For "passcode" challenges, it must be a PasscodeAssertion.
   *                          For "kba" challenges, it must be a KnowledgeBaseAssertion.
   * @returns True if verification passes, otherwise false.
   *
   * @throws Error if the provided server assertion is missing or invalid for the challenge type.
   */
  export function verify(
    definition: Challenge,
    submission: ChallengeSubmission,
    serverAssertion: PasscodeAssertion | KnowledgeBaseAssertion
  ): boolean {
    if (definition.type !== submission.type) return false;

    switch (definition.type) {
      case "passcode": {
        assert(submission.type === "passcode");
        assert(serverAssertion.type === "passcode");
        return serverAssertion.passcode === submission.passcode;
      }
      case "kba": {
        /**
         * Verifies the submission for a Knowledge-Based Authentication (KBA) challenge.
         *
         * The verification process includes:
         * 1. Merging the provided answers into a single object.
         * 2. Validating that each required field in the challenge definition has a non-null, non-empty value.
         *    Rejecting empty or null values—even if they "match" an expected empty value—is a security measure to prevent
         *    authentication attempts with missing or unknown identities. This is critical because customers may not have
         *    certain fields populated, and accepting an empty value could be exploited by an attacker.
         * 3. Checking that the primary identifier field is present and its value matches the expected identity in the server assertion.
         * 4. Ensuring that each required question's answer exactly matches the corresponding expected answer from the server assertion.
         *
         * @returns {boolean} True if all validations pass; otherwise, false.
         */
        assert(submission.type === "kba");
        assert(serverAssertion.type === "kba");
        assert(
          Object.values(definition.questions).filter((q) => q.required)
            .length >= 2,
          "KBA challenge must have at least 2 required questions"
        );

        // Universal validator for required fields:
        // For each required field, reject the submission if its value is null, undefined, or empty.
        for (const [questionName, questionDef] of Object.entries(
          definition.questions
        )) {
          if (questionDef.required) {
            const provided = submission.answers[questionName];
            if (!provided || provided.trim() === "") {
              return false;
            }
          }
        }

        // Extra assertion: Validate that the identifier's value is present and matches the expected identity.
        const identifierValue = submission.answers[definition.identifier];
        if (!identifierValue || identifierValue.trim() === "") {
          // Reject the login attempt if the identifier field is missing or empty.
          // Even if an empty value might "match" an expected empty string, it is rejected by default to prevent
          // potential security vulnerabilities where an attacker exploits an unknown identity.
          return false;
        }
        if (identifierValue.trim() !== serverAssertion.identity?.trim()) {
          return false;
        }

        // Validate each required question's answer against the expected answer.
        for (const [questionName, questionDef] of Object.entries(
          definition.questions
        )) {
          if (questionDef.required) {
            const expected = serverAssertion.answers[questionName];
            const provided = submission.answers[questionName];
            if (!expected || expected.trim() !== provided.trim()) {
              return false;
            }
          }
        }
        return true;
      }
      case "basic":
        throw new Error("Basic auth verification is not implemented.");
      case "otp":
        throw new Error("OTP verification is not implemented.");
      case "magic-link":
        throw new Error("Magic link verification is not implemented.");
      default:
        return false;
    }
  }

  /**
   * Forms the authentication submission based on the challenge type and the provided form data.
   *
   * For:
   * - "passcode": Expects `data.passcode` to be provided.
   * - "basic": Expects `data.username` and `data.password`.
   * - "kba": Expects data to contain answers for the KBA challenge. The submission's answers are wrapped into an array.
   * - "otp": Expects `data.otp`.
   * - "magic-link": Expects `data.token`.
   *
   * This function uses assertions (assert()) to enforce that the required fields are present.
   *
   * @param challenge - The authentication challenge type.
   * @param data - The form data as key-value pairs.
   * @returns A properly formed authentication submission.
   *
   * @throws AssertionError if the required fields for the given type are missing.
   */
  export function form(
    challenge: Challenge,
    data: Record<string, string>
  ): Authentication.ChallengeSubmission {
    switch (challenge.type) {
      case "passcode": {
        assert(data.passcode, "Missing required field: passcode");
        return {
          type: "passcode",
          passcode: data.passcode,
        };
      }
      case "basic": {
        assert(data.username, "Missing required field: username");
        assert(data.password, "Missing required field: password");
        return {
          type: "basic",
          username: data.username,
          password: data.password,
        };
      }
      case "kba":
        // For KBA, we wrap the answers into an array.
        // Additional validation is handled in the verify() function.
        const identity = data[challenge.identifier];
        assert(identity, "Missing required field: identity");

        return {
          type: "kba",
          identity: identity,
          answers: data,
        };
      case "otp": {
        assert(data.otp, "Missing required field: otp");
        return {
          type: "otp",
          otp: data.otp,
        };
      }
      case "magic-link": {
        assert(data.token, "Missing required field: token");
        return {
          type: "magic-link",
          token: data.token,
        };
      }
      default:
        throw new Error(`Unsupported challenge type: ${challenge}`);
    }
  }
}
