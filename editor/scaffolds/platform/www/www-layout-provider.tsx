"use client";

import React from "react";
import { createBrowserWWWClient } from "@/lib/supabase/client";
import { Spinner } from "@/components/ui/spinner";
import { GDocumentType } from "@/types";

type WWWLayout = {
  base_path: string | null;
  created_at: string;
  document_id: string;
  document_type: GDocumentType;
  id: string;
  metadata: any;
  name: string;
  parent_layout_id: string | null;
  path_tokens: string[] | null;
  template_id: string;
  updated_at: string;
  www_id: string;
};

function __useWWWLayoutData(id: string) {
  const client = createBrowserWWWClient();
  const [data, setData] = React.useState<WWWLayout | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | null>(null);

  React.useEffect(() => {
    client
      .from("layout")
      .select()
      .eq("id", id)
      .single()
      .then(({ data, error }) => {
        if (error) {
          setError(error);
        } else {
          setData(data);
        }
        setLoading(false);
        // console.
      });
  }, []);

  return { data, loading, error };
}

const WWWLayoutContext = React.createContext<WWWLayout | null>(null);

export function WWWLayoutProvider({
  id,
  children,
}: React.PropsWithChildren<{ id: string }>) {
  const { data, loading, error } = __useWWWLayoutData(id);
  if (loading) {
    return <Spinner />;
  }

  if (!data) {
    return <div>Layout not found</div>;
  }

  return (
    <WWWLayoutContext.Provider value={data}>
      {children}
    </WWWLayoutContext.Provider>
  );
}

export function useWWWLayout() {
  const context = React.useContext(WWWLayoutContext);
  if (!context) {
    throw new Error("useWWWLayout must be used within a WWWLayoutProvider");
  }
  return context;
}
