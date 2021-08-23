import styled from "@emotion/styled";

const IconButton = styled.button`
  background: transparent;
  border: 0;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;

  &:active,
  &:focus {
    outline: 0;
  }
`;

export default IconButton;
