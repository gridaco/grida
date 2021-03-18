import styled from "@emotion/styled";
import React, {
  useCallback,
  useEffect,
  useRef,
  Children,
  useState,
} from "react";
import { Flex, Text, Button } from "rebass";
import { borderColor, height } from "styled-system";

import Icon from "components/icon";
import { usePopupContext, PopupInfo } from "utils/context/PopupContext";
import { motion } from "framer-motion";

interface PopupChildrenProps {
  popupId?: number;
}

interface PopupProps {
  info: PopupInfo;
}

const Popup = (props: PopupProps) => {
  const { info } = props;
  const { removePopup } = usePopupContext();
  const [closing, setClosing] = useState(false);

  const clonedElement = info.element
    ? React.cloneElement(info.element, {
        popupId: info.id,
      } as PopupChildrenProps)
    : undefined;

  useEffect(() => {
    document.getElementsByTagName("html")[0].style.overflowY = "hidden";

    return () => {
      document.getElementsByTagName("html")[0].style.overflowY = "auto";
    };
  }, []);

  const onClose = useCallback(() => {
    setClosing(true);
    removePopup(info.id);
  }, [info, removePopup]);

  const onModalInnerClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  return (
    <ModalBackground
      onClick={onClose}
      animate={closing ? "closing" : "default"}
      initial={{ opacity: 0 }}
      variants={{
        default: { opacity: 1 },
        closing: { opacity: 0 },
      }}
    >
      <Modal
        width={info.width || "90%"}
        height={(info.height as string) || "90%"}
        onClick={onModalInnerClick}
      >
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
      </Modal>
    </ModalBackground>
  );
};

export default Popup;

const CloseIcon = styled(Icon)`
  position: absolute !important;
  right: -10px;
`;

const ModalBackground = styled(motion.div)`
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  right: 0;
  background-color: rgba(0, 0, 0, 0.6);
  overflow: hidden;
  z-index: 1050;
`;

const Modal = styled(Flex)`
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  top: 50%;
  left: 50%;
  max-width: 1240px;
  max-height: 690px;
  /* max-height: ${props => (props.height ? "initial" : "70%")}; */
  overflow-y: scroll;
  /* border: 1px solid; */
  border-radius: 7px;
  /* box-shadow: 4px 6px 20px 0 rgba(0, 0, 0, 0.09); */
  transform: translate(-50%, -50%);
  ${borderColor}
`;

const ModalHeader = styled(Text)`
  position: relative;
  border-bottom: 1px solid;
  ${borderColor}
`;
