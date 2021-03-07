import styled from "@emotion/styled";
import React, { useCallback, useEffect, useRef, Children } from "react";
import { Box, Text, Button } from "rebass";
import { borderColor, height } from "styled-system";

import Icon from "components/icon";
import { usePopupContext, PopupInfo } from "utils/context/PopupContext";

interface PopupChildrenProps {
  popupId?: number;
}

interface PopupProps {
  info: PopupInfo;
}

const Popup = (props: PopupProps) => {
  const { info } = props;
  const { removePopup } = usePopupContext();

  const buttonRef = useRef<HTMLButtonElement>();

  const clonedElement = info.element
    ? React.cloneElement(info.element, {
        popupId: info.id,
      } as PopupChildrenProps)
    : undefined;

  useEffect(() => {
    if (!info.showOnlyBody && !info.withoutConfirm) {
      buttonRef.current.focus();
    }

    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const onConfirm = useCallback(() => {
    if (info.confirmAction) {
      info.confirmAction();
    }
    removePopup(info.id);
  }, [info, removePopup]);

  const onClose = useCallback(() => {
    if (info.closeAction) {
      info.closeAction();
    }
    removePopup(info.id);
  }, [info, removePopup]);

  const onModalInnerClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  return (
    <ModalBackground onClick={onClose}>
      <Modal
        width={info.width || "360px"}
        // p={["10px", "10px", "15px 30px"]}
        // bg="white"
        // borderColor="gray30"
        onClick={onModalInnerClick}
      >
        {!info.showOnlyBody && (
          <ModalHeader
            pb="10px"
            fontSize="18px"
            color="primary"
            borderColor="gray40"
          >
            {info.title}
            <CloseIcon mr="10px" name="close" color="gray80" onClick={onClose} />
          </ModalHeader>
        )}
        {info.message && (
          <Text
            pt="25px"
            pb="35px"
            textAlign="center"
            color="gray100"
            fontSize="14px"
            style={{ whiteSpace: "pre-line" }}
          >
            {info.message}
          </Text>
        )}
        {clonedElement}
        {!info.showOnlyBody && (
          <Text textAlign="center">
            {info.closeAction && (
              <Button variant="popup" bg="gray80" mr="10px" onClick={onClose}>
                {info.closeLabel || "취소"}
              </Button>
            )}
            {!info.withoutConfirm && (
              <Button variant="popup" onClick={onConfirm} ref={buttonRef}>
                {info.confirmLabel || "확인"}
              </Button>
            )}
          </Text>
        )}
      </Modal>
    </ModalBackground>
  );
};

export default Popup;

const CloseIcon = styled(Icon)`
  position: absolute !important;
  right: -10px;
`;

const ModalBackground = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  right: 0;
  background-color: rgba(0, 0, 0, 0.6);
  overflow: hidden;
  z-index: 1050;
`;

const Modal = styled(Box)`
  position: absolute;
  top: 50%;
  left: 50%;
  max-height: ${props => (props.height ? "initial" : "70%")};
  overflow-y: scroll;
  /* border: 1px solid; */
  border-radius: 7px;
  box-shadow: 4px 6px 20px 0 rgba(0, 0, 0, 0.09);
  transform: translate(-50%, -50%);
  ${borderColor}
`;

const ModalHeader = styled(Text)`
  position: relative;
  border-bottom: 1px solid;
  ${borderColor}
`;