import styled from "@emotion/styled";
import React, { useCallback } from "react";
import { Flex } from "rebass";

import Product from "components/header/product";

import { GroupEntity } from "../headermap";

function HoverMenu({
  item,
  isExpand,
  onExit,
  type,
}: {
  item: GroupEntity;
  isExpand: boolean;
  onExit: () => void;
  type: "mobile" | "desktop";
}) {
  const close = useCallback(() => {
    onExit();
  }, []);

  const onModalInnerClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  return (
    <React.Fragment>
      {type === "desktop" && (
        <Container data-expanded={isExpand}>
          <ModalBackground onClick={close}>
            <HoverView
              onMouseLeave={close}
              p={["10px", "10px", "15px 30px"]}
              bg="white"
              onClick={onModalInnerClick}
            >
              <ExpandHeaderContent
                width={["320px", "730px", "985px", "1040px"]}
                height="100%"
              >
                {item.children.map((i, index) => (
                  <Product
                    key={index}
                    iconName="mockIcon"
                    title={i.label}
                    href={i.href}
                    desc={i.tagline}
                  />
                ))}
              </ExpandHeaderContent>
            </HoverView>
          </ModalBackground>
        </Container>
      )}
      {type === "mobile" && (
        <Container
          data-expanded={isExpand}
          flexDirection="column"
          mt="12px"
          mb="24px"
        >
          {item.children.map((i, index) => (
            <Product
              key={index}
              iconName="mockIcon"
              title={i.label}
              href={i.href}
              desc="Tell customer about this product. Keep it simple"
            />
          ))}
        </Container>
      )}
    </React.Fragment>
  );
}

export default HoverMenu;

const Container = styled(Flex)`
  opacity: 0;
  pointer-events: none;

  &[data-expanded="true"] {
    opacity: 1;
    pointer-events: auto;
  }

  transition: all 0.1s ease-in-out;
`;

const ModalBackground = styled.div`
  position: fixed;
  top: 60px;
  left: 0;
  bottom: 0;
  right: 0;
  background-color: rgba(0, 0, 0, 0.3);
  overflow: hidden;
  z-index: 1050;
`;

const HoverView = styled(Flex)`
  position: absolute;
  top: 210px;
  left: 50%;
  width: 100%;
  height: 500px;
  overflow-y: scroll;
  box-shadow: 4px 6px 20px 0 rgba(0, 0, 0, 0.09);
  transform: translate(-50%, -50%);
  align-items: center;
  justify-content: center;
`;

const ExpandHeaderContent = styled(Flex)`
  display: grid;
  grid-template-columns: 250px 250px 250px;
  /* grid-template-rows: 70px 70px 70px; */
  grid-column-gap: 48px;
  grid-row-gap: 21px;

  max-height: 350px;
`;
