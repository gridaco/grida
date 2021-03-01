import Icon from 'components/icon';
import React, { useCallback, useState } from 'react'
import { Text, Flex, Box } from 'rebass';
import styled from '@emotion/styled';

const ExpandHeaderItem = ({ item }) => {
    const [isExpand, setIsExpand] = useState(false);

    const onClose = useCallback(() => {
        setIsExpand(false)
    }, []);

    const onModalInnerClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
    }, []);

    return (
        <Flex >
            <Label color={isExpand ? "#000" : "#8B8B8B"} fontWeight="bold" fontSize="16px" onClick={() => setIsExpand(!isExpand)}>{item.label} <Icon name={isExpand ? "arrowUp" : "arrowDown"} isVerticalMiddle /></Label>
            {isExpand && <ModalBackground onClick={onClose}>
                <Modal
                    p={["10px", "10px", "15px 30px"]}
                    bg="white"
                    height="430px"
                    onClick={onModalInnerClick}
                >

                </Modal>
            </ModalBackground>}
        </Flex>
    )
}

export default ExpandHeaderItem

const Label = styled(Text)`
    margin: 0px 12px;
    font-weight: bold;
    font-size: 16px;
    display: flex;
    align-items: center;
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

const Modal = styled(Box)`
  position: absolute;
  top: 16%;
  left: 50%;
  width: 100%;
  overflow-y: scroll;
  box-shadow: 4px 6px 20px 0 rgba(0, 0, 0, 0.09);
  transform: translate(-50%, -50%);
`;