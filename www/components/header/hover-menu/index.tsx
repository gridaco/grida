import styled from "@emotion/styled";
import { useTranslation } from "next-i18next";
import React, { useCallback } from "react";
import { Flex } from "theme-ui";

import { GroupEntity } from "../headermap";
import { LineItem } from "../line-item";
import { ModuleGroup, ModuleItem } from "../modules";
import { ProductItem } from "../product";

function HoverMenu({
  item,
  onExit,
  type,
}: {
  item: GroupEntity;
  onExit?: () => void;
  type: "mobile" | "desktop";
}) {
  const { t } = useTranslation(["common", "header"]);

  const close = useCallback(() => {
    onExit?.();
  }, []);

  const onModalInnerClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  return (
    <React.Fragment>
      {type === "desktop" && (
        <Flex>
          <HoverView
            onMouseLeave={close}
            bg="white"
            onClick={onModalInnerClick}
          >
            <ContainerLayout type={item.label as any}>
              {item.children.map((i, index) => {
                const label = t(i.label);
                switch (i.layout) {
                  case "module-group": {
                    return <ModuleGroup key={index} {...i} />;
                  }
                  case "module-item":
                    return (
                      <ModuleItem
                        key={index}
                        label={label}
                        icon={i.icon}
                        href={i.href}
                      />
                    );
                  case "product-item":
                    return (
                      <ProductItem
                        key={index}
                        label={label}
                        href={i.href}
                        tagline={t(i.tagline)}
                      />
                    );
                  case "line-item":
                  default:
                    return <LineItem key={index} {...i} label={label} />;
                }
              })}
            </ContainerLayout>
          </HoverView>
        </Flex>
      )}
      {type === "mobile" && (
        <Flex
          style={{
            flexDirection: "column",
          }}
          mt="12px"
          mb="24px"
        >
          {item.children.map((i, index) => (
            <ProductItem
              key={index}
              icon="mockIcon"
              label={i.label}
              href={i.href}
              tagline="Tell customer about this product. Keep it simple"
            />
          ))}
        </Flex>
      )}
    </React.Fragment>
  );
}

export default HoverMenu;

function ContainerLayout({
  type,
  children,
}: React.PropsWithChildren<{
  type: "products" | "resources" | "frameworks";
}>) {
  switch (type) {
    case "products": {
      return <ProductsLayout>{children}</ProductsLayout>;
    }
    case "frameworks": {
      return <GridContentLayout>{children}</GridContentLayout>;
    }
    case "resources": {
      return <ResourcesLayout>{children}</ResourcesLayout>;
    }
    default: {
      return <GridContentLayout>{children}</GridContentLayout>;
    }
  }
}

const HoverView = styled(Flex)`
  position: relative;
  width: 100%;
  overflow-y: scroll;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  box-shadow: 4px 12px 24px 4px rgba(0, 0, 0, 0.09);
`;

const ProductsLayout = styled(Flex)`
  flex-direction: column;
  gap: 8px;
  padding: 24px;
`;

const ResourcesLayout = styled(Flex)`
  flex-direction: column;

  gap: 21px;
  padding: 24px;
`;

const GridContentLayout = styled(Flex)`
  height: 100%;
  display: grid;
  grid-auto-flow: row;
  grid-template-columns: 1fr 1fr 1fr;
  grid-template-rows: repeat(auto-fill, 1fr);
  grid-row-gap: 21px;
  padding-top: 16px;
  padding-bottom: 32px;
`;
