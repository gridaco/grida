import Icon from 'components/icon';
import React, { useCallback, useState } from 'react'
import { Text, Flex, Box } from 'rebass';
import styled from '@emotion/styled';
import Product from 'components/product';

const ExpandHeaderItem = ({ item, isExpand, onExpandHeader, onContractHeader, type }) => {

    const onClose = useCallback(() => {
        onContractHeader()
    }, []);

    const onModalInnerClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
    }, []);

    return (
        <React.Fragment>
            <Flex >
                <Label
                    className="cursor"
                    color={isExpand ? "#000" : "#8B8B8B"}
                    isBorder={isExpand && type == "desktop"}
                    onMouseOver={type == "desktop" ? onExpandHeader : null}
                    onClick={type == "mobile" ? isExpand ? onContractHeader : onExpandHeader : null}
                    fontWeight="bold"
                    fontSize="16px"
                    mx={type === "desktop" && "12px"}
                >
                    {item.label}
                    <Icon name={isExpand ? "arrowUp" : "arrowDown"} isVerticalMiddle />
                </Label>
                {isExpand && type === "desktop" && <ModalBackground onClick={onClose} >
                    <Modal
                        p={["10px", "10px", "15px 30px"]}
                        bg="white"
                        height="430px"
                        onClick={onModalInnerClick}
                    >
                        <ExpandHeaderContent
                            width={["320px", "730px", "985px", "1040px"]}
                            height="100%"
                            onMouseOver={onExpandHeader}
                            onMouseLeave={onContractHeader}
                        >
                            <Product iconName="mockIcon" title="Globalization" desc="Tell customer about this product. Keep it simple" />
                            <Product iconName="mockIcon" title="Globalization" desc="Tell customer about this product. Keep it simple" />
                            <Product iconName="mockIcon" title="Globalization" desc="Tell customer about this product. Keep it simple" />
                            <Product iconName="mockIcon" title="Globalization" desc="Tell customer about this product. Keep it simple" />
                            <Product iconName="mockIcon" title="Globalization" desc="Tell customer about this product. Keep it simple" />
                            <Product iconName="mockIcon" title="Globalization" desc="Tell customer about this product. Keep it simple" />
                            <Product iconName="mockIcon" title="Globalization" desc="Tell customer about this product. Keep it simple" />
                        </ExpandHeaderContent>
                    </Modal>
                </ModalBackground>}

            </Flex>
            {isExpand && type === "mobile" && <Flex flexDirection="column" mt="12px" mb="24px">
                <Product iconName="mockIcon" title="Globalization" desc="Tell customer about this product. Keep it simple" />
                <Product iconName="mockIcon" title="Globalization" desc="Tell customer about this product. Keep it simple" />
                <Product iconName="mockIcon" title="Globalization" desc="Tell customer about this product. Keep it simple" />
                <Product iconName="mockIcon" title="Globalization" desc="Tell customer about this product. Keep it simple" />
                <Product iconName="mockIcon" title="Globalization" desc="Tell customer about this product. Keep it simple" />
                <Product iconName="mockIcon" title="Globalization" desc="Tell customer about this product. Keep it simple" />
                <Product iconName="mockIcon" title="Globalization" desc="Tell customer about this product. Keep it simple" />
            </Flex>}
        </React.Fragment>
    )
}

export default ExpandHeaderItem

const Label = styled(Text) <{ isBorder: boolean }>`
    font-weight: bold;
    font-size: 16px;
    display: flex;
    align-items: center;
    padding: 16px 0px;

    ${p => p.isBorder && `
        border-bottom: 2px solid black;
    `}

    @media (min-width: 767px) {
        &:hover {
            color: #000;
        }
    }
`

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

const Modal = styled(Flex)`
  position: absolute;
  top: 210px;
  left: 50%;
  width: 100%;
  overflow-y: scroll;
  box-shadow: 4px 6px 20px 0 rgba(0, 0, 0, 0.09);
  transform: translate(-50%, -50%);
  align-items: center;
  justify-content: center;
`;

const ExpandHeaderContent = styled(Flex)`
    display: grid;
    grid-template-columns: 250px 250px;
    grid-template-rows: 70px 70px;
    grid-column-gap: 48px;
    grid-row-gap: 21px;

    max-height: 350px;

`