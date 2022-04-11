import { keyframes } from "@emotion/css";
import styled from "@emotion/styled";

const fade = keyframes`
  from {
    opacity: 0;
  }

  to {
    opacity: 100;
  }
`;

export const LoadingOneDotFadeInAndOutInfinite = styled.div<{ size?: number }>`
  animation: ${fade} 0.5s ease-in infinite;
  background-color: white;
  width: ${({ size }) => size || 4}px;
  height: ${({ size }) => size || 4}px;
  border-radius: 50%;
`;
