"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClientWWWClient } from "@/lib/supabase/client";
import { nanoid } from "nanoid";
import { FileIO } from "@/lib/file";

export interface WWWTemplateEditorInstance<T extends Record<string, any>> {
  data: T | null;
  set: (data: T | null) => void;
  save: () => Promise<boolean>;
  upload: FileIO.BucketFileUploaderFn;
  dirty: boolean;
  loading: boolean;
  saving: boolean;
  error: Error | null;
}

type WWWTemplate<T = any> = {
  id: string;
  data: T;
  is_public: boolean;
  is_draft: boolean;
  www_id: string;
};

export function useWWWTemplate<T extends Record<string, any>>(
  id: string
): WWWTemplateEditorInstance<T> {
  const client = useMemo(() => createClientWWWClient(), []);

  const [__template, setTemplate] = useState<WWWTemplate<T> | null>(null);
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    const { data: result, error } = await client
      .from("template")
      .select()
      .eq("id", id)
      .single();

    if (error) {
      setError(error);
    } else {
      setTemplate(result satisfies WWWTemplate<any> as WWWTemplate<T>);
      setData(result.data as T);
    }

    setLoading(false);
  }, [client, id]);

  const set = useCallback(
    (newdata: T | null) => {
      setData(newdata);
      setDirty(
        JSON.stringify(newdata) !== JSON.stringify(__template?.data ?? null)
      );
    },
    [__template]
  );

  const save = useCallback(async () => {
    if (!data) return false;
    setSaving(true);
    const { error } = await client
      .from("template")
      .update({ data: data as any })
      .eq("id", id);

    setSaving(false);

    if (error) {
      setError(error);
      return false;
    } else {
      setDirty(false);
      setTemplate((prev) => (prev ? { ...prev, data: data as T } : null));
      return true;
    }
  }, [client, id, data]);

  const upload: FileIO.BucketFileUploaderFn = useCallback(
    async (file: File, config?: { upsert?: boolean }) => {
      if (!__template) throw new Error("not ready");
      const path = `/${__template.www_id}/templates/${id}/${nanoid()}`;
      const { data: uploaded, error } = await client.storage
        .from("www")
        .upload(path, file, config);

      if (error) throw error;

      return {
        bucket: "www",
        object_id: uploaded.id,
        fullPath: uploaded.fullPath,
        path: uploaded.path,
        publicUrl: client.storage.from("www").getPublicUrl(path).data.publicUrl,
      };
    },
    [client, id, __template]
  );

  useEffect(() => {
    fetch();
  }, [fetch]);

  return {
    data,
    set,
    save,
    upload,
    dirty,
    loading,
    saving,
    error,
  };
}
