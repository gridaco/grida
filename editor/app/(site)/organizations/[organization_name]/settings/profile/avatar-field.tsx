"use client";

import React, { useEffect, useRef, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

const ACCEPT = "image/png,image/jpeg,image/webp";

/**
 * Avatar control inside the org General form. Renders the current avatar (or
 * initials fallback), lets the user pick a replacement with a local preview, or
 * remove it. The actual write happens on the form's submit via the server
 * action — this only carries the `avatar` file and the `remove_avatar` flag.
 */
export function OrganizationAvatarField({
  current_avatar_url,
  display_name,
}: {
  current_avatar_url?: string | null;
  display_name?: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);

  const shown = removed ? null : (preview ?? current_avatar_url ?? null);

  // Revoke the object URL when it's replaced (deps change) or on unmount, so
  // picking multiple files (or leaving the page) doesn't leak blob URLs.
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRemoved(false);
    setPreview(URL.createObjectURL(file));
  };

  const onRemove = () => {
    setPreview(null);
    setRemoved(true);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="flex items-center gap-4">
      <Avatar className="size-16 border shadow-sm rounded-md">
        {shown ? (
          <AvatarImage src={shown} className="object-cover" />
        ) : (
          <AvatarFallback className="rounded-none font-bold">
            {display_name?.charAt(0).toUpperCase()}
          </AvatarFallback>
        )}
      </Avatar>
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          name="avatar"
          accept={ACCEPT}
          className="hidden"
          onChange={onPick}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
        >
          Change
        </Button>
        {shown && (
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            Remove
          </Button>
        )}
      </div>
      {/* Tells the server action to clear avatar_path on submit. */}
      {removed && <input type="hidden" name="remove_avatar" value="1" />}
    </div>
  );
}
