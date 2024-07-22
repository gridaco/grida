import React from "react";

export function GridRoot({ children }: React.PropsWithChildren<{}>) {
  return <header className="flex flex-col h-full">{children}</header>;
}

export function GridHeader({ children }: React.PropsWithChildren<{}>) {
  return (
    <header className="h-14 w-full flex items-center justify-between gap-4 px-4 py-1">
      {children}
    </header>
  );
}

export function GridHeaderMenus({ children }: React.PropsWithChildren<{}>) {
  return <div className="flex gap-2 items-center">{children}</div>;
}

export function GridContent({ children }: React.PropsWithChildren<{}>) {
  return <div className="flex flex-col w-full h-full">{children}</div>;
}

export function GridFooter({ children }: React.PropsWithChildren<{}>) {
  return (
    <div className="flex gap-4 min-h-9 overflow-hidden items-center px-2 py-2 w-full border-t divide-x">
      {children}
    </div>
  );
}

// export function GridFooter({ children }: React.PropsWithChildren<{}>) {
//   return <></>;
// }
