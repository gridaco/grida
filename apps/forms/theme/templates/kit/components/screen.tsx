export function ScreenRoot({ children }: React.PropsWithChildren<{}>) {
  return <div className="h-dvh w-dvw overflow-hidden md:p-4">{children}</div>;
}

export function ScreenMobileFrame({ children }: React.PropsWithChildren<{}>) {
  return (
    <main className="relative overflow-hidden md:container w-full h-full md:max-w-md mx-auto md:rounded-lg md:shadow-lg !p-0">
      {children}
    </main>
  );
}

export function ScreenRootBackground({
  children,
}: React.PropsWithChildren<{}>) {
  return (
    <div className="fixed inset-0 w-full h-full -z-50 pointer-events-none select-none">
      {children}
    </div>
  );
}

export function ScreenBackground({ children }: React.PropsWithChildren<{}>) {
  return (
    <div className="relative inset-0 w-full h-full -z-40 select-none">
      {children}
    </div>
  );
}

export function ScreenGrid({
  children,
  columns,
  rows,
}: React.PropsWithChildren<{
  columns: number;
  rows: number;
}>) {
  return (
    <div
      className="absolute inset-0 w-full h-full grid grid-cols-2 grid-rows-2"
      style={{
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
      }}
    >
      {children}
    </div>
  );
}

export function ScreenGridPosition({
  children,
  col,
  row,
}: React.PropsWithChildren<{
  col: number;
  row: number;
}>) {
  return (
    <div
      className={"absolute inset-0 w-full h-full"}
      style={{
        gridColumn: col,
        gridRow: row,
      }}
    >
      {children}
    </div>
  );
}

export function ScreenGridArea({
  children,
  area,
}: React.PropsWithChildren<{
  /**
   * [startRow, startCol, endRow, endCol]
   */
  area: [number, number, number, number];
}>) {
  const [startRow, startCol, endRow, endCol] = area;
  return (
    <div
      className="w-full h-full"
      style={{
        gridColumn: `${startCol} / ${endCol}`,
        gridRow: `${startRow} / ${endRow}`,
      }}
    >
      {children}
    </div>
  );
}

export function ScreenDecorations({ children }: React.PropsWithChildren<{}>) {
  return (
    <div className="absolute inset-0 w-full h-full z-50 pointer-events-none select-none">
      {children}
    </div>
  );
}
