import React from "react";
import {
  Scaffold as Boring,
  ScaffoldProps as BoringProps,
  InitialDocumentProp,
  OnContentChange,
} from "@boringso/react-core";
import { boring_extended_import_design_with_url } from "../built-in-pages/getting-started-components";
import { extensions as default_extensions } from "../app-blocks";
const extensions = [
  ...default_extensions,
  boring_extended_import_design_with_url,
];

export function BoringScaffold({
  initial,
  onTitleChange,
  onContentChange,
  readonly = false,
  ...props
}: Omit<BoringProps, "extensions">) {
  return (
    <ClientOnly>
      <Boring
        readonly={readonly}
        initial={initial}
        extensions={extensions}
        onTitleChange={onTitleChange}
        onContentChange={onContentChange}
        {...props}
      />
    </ClientOnly>
  );
}

const ClientOnly = ({ children, ...delegated }) => {
  const [hasMounted, setHasMounted] = React.useState(false);

  React.useEffect(() => {
    setHasMounted(true);
  }, []);

  if (!hasMounted) return null;

  return <React.Fragment {...delegated}>{children}</React.Fragment>;
};

export default ClientOnly;
