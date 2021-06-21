import React, { useCallback } from "react";
import styled from "@emotion/styled";
import { useDispatch } from "@core/app-state";

export function AddPageButton() {
  const dispatch = useDispatch();

  const handleAddPage = useCallback(() => {
    const name = prompt("New page Name");

    if (name !== null) dispatch("addPage", name);
  }, [dispatch]);

  return <Button onClick={handleAddPage}>+ Add Page</Button>;
}

const Button = styled.button`
  width: 100%;
  border: none;
  background: none;
`;
