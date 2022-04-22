import React, { useEffect, useRef, useState } from "react";
import styled from "@emotion/styled";
import { useRouter } from "next/router";
import { ClearRemoteDesignSessionCache } from "components/clear-remote-design-session-cache";
import { WidgetTree } from "@code-editor/devtools/components/visualization/json-visualization/json-tree";
import Link from "next/link";

export const Debugger = ({
  id,
  file,
  type,
  entry,
  widget,
}: {
  type: string;
  id: string;
  file: string;
  entry: any;
  widget: any;
}) => {
  const router = useRouter();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "stretch",
      }}
    >
      <div style={{ flex: 1 }}>
        <ClearRemoteDesignSessionCache key={id} file={file} node={id} />
        <br />
        {(type === "INSTANCE" || type === "COMPONENT") && (
          <Link
            href={{
              pathname: "/figma/inspect-component",
              query: {
                // e.g. https://www.figma.com/file/iypAHagtcSp3Osfo2a7EDz/engine?node-id=3098%3A4097
                design: `https://www.figma.com/file/${file}/?node-id=${id}`,
              },
            }}
          >
            inspect component
          </Link>
        )}
      </div>

      <div style={{ flex: 2 }}>
        <WidgetTree data={entry} />
      </div>
      <div style={{ flex: 2 }}>
        <WidgetTree data={widget} />
      </div>
    </div>
  );
};
