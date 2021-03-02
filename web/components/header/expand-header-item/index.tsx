import Icon from 'components/icon';
import React, { useCallback, useState } from 'react'
import { Text, Flex, Box } from 'rebass';
import styled from '@emotion/styled';
import Product from 'components/product';

const ExpandHeaderItem = ({ item, isExpand, onExpandHeader, onContractHeader }) => {

    const onClose = useCallback(() => {
        onContractHeader()
    }, []);

    const onModalInnerClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
    }, []);

    return (
        <Flex >
            <Label
                className="cursor"
                color={isExpand ? "#000" : "#8B8B8B"}
                isBorder={isExpand}
                onMouseOver={onExpandHeader}
                fontWeight="bold"
                fontSize="16px"
            >
                {item.label}
                <Icon name={isExpand ? "arrowUp" : "arrowDown"} isVerticalMiddle />
            </Label>
            {isExpand && <ModalBackground onClick={onClose} >
                <Modal
                    p={["10px", "10px", "15px 30px"]}
                    bg="white"
                    height="430px"
                    onClick={onModalInnerClick}
                    onMouseOver={onExpandHeader}
                    onMouseLeave={onContractHeader}
                >
                    <ExpandHeaderContent width={["320px", "730px", "985px", "1040px"]} height="100%">
                        <Product />
                        <Product />
                        <Product />
                        <Product />
                        <Product />
                        <Product />
                        <Product />
                    </ExpandHeaderContent>
                </Modal>
            </ModalBackground>}
        </Flex>
    )
}

export default ExpandHeaderItem

const Label = styled(Text) <{ isBorder: boolean }>`
    margin: 0px 12px;
    font-weight: bold;
    font-size: 16px;
    display: flex;
    align-items: center;
    padding: 16px 0px;

    ${p => p.isBorder && `
        border-bottom: 2px solid black;
    `}

    &:hover {
        color: #000;
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