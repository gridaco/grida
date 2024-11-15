export function ScreenWindowRoot({ children }: React.PropsWithChildren<{}>) {
  return (
    <div className="relative h-dvh w-dvw max-w-screen-2xl mx-auto overflow-hidden">
      {children}
    </div>
  );
}

export function ScreenRoot({ children }: React.PropsWithChildren<{}>) {
  return (
    <div className="@container/screen relative w-full h-full">
      <div className="relative w-full h-full @lg/screen:p-4">{children}</div>
    </div>
  );
}

export function ScreenCenter({ children }: React.PropsWithChildren<{}>) {
  return (
    <div className="relative flex justify-center items-center h-full w-full md:rounded-md md:shadow-md overflow-hidden">
      {children}
    </div>
  );
}

export function ScreenMobileFrame({ children }: React.PropsWithChildren<{}>) {
  return (
    <main className="relative overflow-hidden @lg/screen:container w-full h-full @lg/screen:max-w-md mx-auto @lg/screen:rounded-lg @lg/screen:shadow-lg @lg/screen:border !p-0">
      {children}
    </main>
  );
}

export function ScreenScrollable({ children }: React.PropsWithChildren<{}>) {
  return (
    <div className="relative overflow-y-scroll w-full h-full">{children}</div>
  );
}

export function ScreenRootBackground({
  children,
}: React.PropsWithChildren<{}>) {
  return (
    <div className="absolute inset-0 w-full h-full -z-50 pointer-events-none select-none">
      {children}
    </div>
  );
}

export function ScreenBackground({
  children,
  overlay,
}: React.PropsWithChildren<{
  overlay?: {
    opacity?: number;
  };
}>) {
  return (
    <>
      {overlay && (
        <div
          className="absolute inset-0 w-full h-full bg-background pointer-events-none select-none"
          style={{
            opacity: overlay.opacity,
          }}
        />
      )}
      <div className="absolute inset-0 w-full h-full -z-40 select-none pointer-events-none">
        {children}
      </div>
    </>
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
  zIndex,
}: React.PropsWithChildren<{
  /**
   * [startRow, startCol, endRow, endCol]
   */
  area: [number, number, number, number];
  zIndex?: number;
}>) {
  const [startRow, startCol, endRow, endCol] = area;
  return (
    <div
      className="w-full h-full"
      style={{
        gridColumn: `${startCol} / ${endCol}`,
        gridRow: `${startRow} / ${endRow}`,
        zIndex: zIndex,
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
