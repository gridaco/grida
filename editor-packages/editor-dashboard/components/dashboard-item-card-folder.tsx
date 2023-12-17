import React from "react";
import { SquareIcon } from "@radix-ui/react-icons";
import {
  DashboardItemCard,
  DashboardItemCardProps,
} from "./dashboard-item-card";
import { DashboardFolderItem } from "../core";

function FolderCardPreview() {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: 160,
        width: 300,
        boxSizing: "border-box",
      }}
    >
      <img
        style={{
          height: "100%",
          width: 120,
          margin: "auto",
          objectFit: "contain",
          objectPosition: "center",
        }}
        src="/assets/mac-folder-icon.png"
      />
    </div>
  );

  //
}

export type FolderCardProps = Omit<
  DashboardItemCardProps,
  "icon" | "preview" | "label"
> &
  Omit<DashboardFolderItem, "$type">;

export const FolderCard = React.forwardRef(function (
  { name, ...props }: FolderCardProps,
  ref: React.Ref<HTMLDivElement>
) {
  return (
    <DashboardItemCard
      ref={ref}
      id={props.id}
      {...props}
      label={name}
      icon={<SquareIcon color="white" />}
      preview={<FolderCardPreview />}
    />
  );
});
