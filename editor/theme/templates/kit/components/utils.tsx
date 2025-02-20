export function TextAlign({
  children,
  align = "left",
}: React.PropsWithChildren<{
  align: "left" | "center" | "right";
}>) {
  return (
    <span
      style={{
        textAlign: align,
      }}
    >
      {children}
    </span>
  );
}
