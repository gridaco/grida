import * as React from "react";

interface EmailTemplateProps {
  firstName: string;
}

export default function EmailTemplateCustomerPortalVerification({
  firstName,
}: Readonly<EmailTemplateProps>) {
  return (
    <div>
      <h1>Welcome, {firstName}!</h1>
    </div>
  );
}
