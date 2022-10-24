import React, { CSSProperties } from "react";

export function InspectorSection({
  children,
  label,
  contentPadding = "8px",
}: React.PropsWithChildren<{
  label: string;
  contentPadding?: CSSProperties["padding"];
}>) {
  return (
    <section>
      <InfoSectionLabel>{label}</InfoSectionLabel>
      <div
        style={{
          padding: contentPadding,
        }}
      >
        {children}
      </div>
    </section>
  );
}

export function InfoSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h6
      className="white"
      style={{
        cursor: "default",
        paddingLeft: 8,
      }}
    >
      {children}
    </h6>
  );
}
