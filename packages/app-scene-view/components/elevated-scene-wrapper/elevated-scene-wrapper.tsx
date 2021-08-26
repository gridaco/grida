import styled from "@emotion/styled";

interface Props {
  children: JSX.Element;
}

export function ElevatedSceneWrap(props: Props) {
  return <FrameWrapper>{props.children}</FrameWrapper>;
}

const FrameWrapper = styled.div`
  background: #ffffff;
  box-shadow: 0px 0px 4px rgba(222, 222, 222, 0.25),
    0px 0px 32px 4px rgba(220, 220, 220, 0.12);
  border-radius: 2px;
  width: fit-content;
  height: fit-content;
  /* TEMPORARY MEASURES */
  z-index: -1;
`;
