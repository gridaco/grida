# @workspace/emails

Private workspace email presentation. The first shared template is CIAM email
verification; unrelated templates remain with their current owners.

```tsx
import VerificationEmail, {
  subject,
  supported_languages,
  type CIAMVerificationEmailLang,
  type CIAMVerificationEmailProps,
} from "@workspace/emails/ciam-verification";

const props = {
  brand_name: "Example",
  email_otp: "123456",
  lang: "en" as const,
};
const title = subject(props.lang, props);
const element = <VerificationEmail {...props} />;
```

The caller renders the element with React Email or passes it to its existing
delivery adapter. The template defaults to English, ten-minute expiry text and
an unnamed greeting. Optional customer names are trimmed. Support URLs and
contacts appear only when supplied; a contact containing `@` receives a mailto
link. The source preserves the existing English, Korean, Spanish, Japanese and
Chinese copy and layout.

Producer tests cover every language, default and complete HTML fingerprints,
optional support variants and escaping. Fingerprints capture original rendered
output; intentional copy/layout or renderer updates require deliberate review.

## Boundaries

No credentials, provider SDKs, recipient lookup, database access, application
imports, OTP generation, delivery retries or environment configuration. Callers
own permitted link destinations and brand values; escaping text does not make
arbitrary URLs trustworthy. This package is presentation, not a mail service or
a native-language template export system.
