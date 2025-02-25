"use client";

import React from "react";
import { CellRoot } from "../cells";
import { PlusIcon } from "@radix-ui/react-icons";
import type { Column, RenderHeaderCellProps } from "react-data-grid";
import type { DGResponseRow } from "../types";

type CreateNewAttributeContextState = {
  onAddNewFieldClick?: () => void;
};

const CreateNewAttributeContext =
  React.createContext<CreateNewAttributeContextState | null>(null);

export function CreateNewAttributeProvider({
  onAddNewFieldClick,
  children,
}: React.PropsWithChildren<CreateNewAttributeContextState>) {
  return (
    <CreateNewAttributeContext.Provider value={{ onAddNewFieldClick }}>
      {children}
    </CreateNewAttributeContext.Provider>
  );
}

function useCreateNewAttribute() {
  const context = React.useContext(CreateNewAttributeContext);
  if (!context) {
    throw new Error(
      "useCreateNewAttribute must be used within a CreateNewAttributeProvider"
    );
  }
  return context;
}

export const CreateNewAttributeColumn: Column<DGResponseRow> = {
  key: "__gf_new",
  name: "+",
  resizable: false,
  draggable: false,
  sortable: false,
  width: 100,
  renderHeaderCell: (props) => {
    const { onAddNewFieldClick } = useCreateNewAttribute();
    return <NewFieldHeaderCell {...props} onClick={onAddNewFieldClick} />;
  },
};

function NewFieldHeaderCell({
  onClick,
}: RenderHeaderCellProps<any> & {
  onClick?: () => void;
}) {
  return (
    <CellRoot className="border-t-0">
      <button
        onClick={onClick}
        className="w-full h-full flex items-center justify-center"
      >
        <PlusIcon />
      </button>
    </CellRoot>
  );
}
