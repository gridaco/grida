import React, { useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
  AlertDialogPrimitive,
  AlertDialogOverlay,
} from "@editor-ui/alert-dialog";
import styled from "@emotion/styled";
import Dialog from "@material-ui/core/Dialog";

export function DeletePostConfirmAlertDialog({
  open,
  onCancel,
  onDeleteConfirm,
}: {
  open: boolean;
  onCancel?: () => void;
  onDeleteConfirm: () => void;
}) {
  return (
    <Dialog open={open}>
      <Body>
        {/* <AlertDialogContent> */}
        <Title>Delete Post</Title>
        <Description>
          This will permanently delete the post. This action cannot be undone.
          {/* 이 포스트를 정말 삭제하시겠습니까? 삭제된 포스트는 복구가
          불가능합니다. */}
        </Description>

        {/* <AlertDialogTitle>Delete Post</AlertDialogTitle> */}
        {/* <AlertDialogDescription>
        This will permanently delete this post. (This action cannot be undone. )
      </AlertDialogDescription> */}
        <ActionsContainer>
          {/* <AlertDialogCancel asChild> */}
          <CancelButton onClick={onCancel}>Cancel</CancelButton>
          {/* </AlertDialogCancel> */}
          {/* <AlertDialogAction asChild> */}
          <DeleteButton onClick={onDeleteConfirm}>Delete</DeleteButton>
          {/* </AlertDialogAction> */}
        </ActionsContainer>
        {/* </AlertDialogContent> */}
      </Body>
    </Dialog>
  );
}

const Title = styled.h2`
  margin: 0;
`;

const Description = styled.p`
  min-width: 320px;
  color: rgba(0, 0, 0, 0.7);
`;

const Body = styled.div`
  display: flex;
  flex-direction: column;
  align-items: start;
  justify-content: center;
  padding: 40px 32px 32px;
`;

const ActionsContainer = styled.div`
  display: flex;
  justify-content: flex-end;
  padding: 20px 0px 0px 0px;
  gap: 16px;
  align-self: stretch;
  flex: 1;
`;

const DeleteButton = styled.button`
  background: ${({ theme }) =>
    // @ts-ignore
    theme.app_posts_cms.colors.button_danger};
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 10px 20px;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  outline: none;
  transition: all 0.2s ease-in-out;

  :hover {
    opacity: 0.9;
  }

  :active {
    opacity: 1;
  }
`;

const CancelButton = styled.button`
  background: rgba(0, 0, 0, 0.1);
  color: #000;
  border: none;
  border-radius: 4px;
  padding: 10px 20px;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  outline: none;
  transition: all 0.2s ease-in-out;

  :hover {
    opacity: 0.9;
  }
`;
