import React, { useCallback } from "react";
import styled from "@emotion/styled";
import { useDispatch } from "@core/app-state";
import { PlusIcon } from "@radix-ui/react-icons";
import { Spacer } from "@editor-ui/spacer";

export function AddPageButton() {
  const dispatch = useDispatch();

  const handleAddPage = useCallback(() => {
    const name = prompt("New page Name");

    if (name !== null)
      dispatch({
        type: "add-page",
        name,
      });
  }, [dispatch]);

  return (
    <Button onClick={handleAddPage}>
      <PlusIcon />
      <Spacer.Horizontal size={8} />
      Add Page
    </Button>
  );
}

const Button = styled.button`
  width: 100%;
  border: none;
  padding: 12px;
  background: none;
  color: grey;

  :hover {
    background: #e1e1e1;
  }

  :active {
    background: #d0d0d0;
  }

  display: flex;
  flex-direction: row;
  align-content: center;
  justify-content: center;
`;
