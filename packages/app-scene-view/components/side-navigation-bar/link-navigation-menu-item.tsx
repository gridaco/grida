import React from "react";
import ListItem, { ListItemProps } from "@material-ui/core/ListItem";

export function LinkNavigationMenuItem(
  props: ListItemProps<"a", { button?: true }>
) {
  return <ListItem button component="a" {...props} />;
}
