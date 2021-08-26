import styled from "@emotion/styled";

interface Props {
  children: HTMLElement;
}

export function ElevatedSceneWrap(props: Props) {
  return <FrameWrapper>{props.children}</FrameWrapper>;
}

const FrameWrapper = styled.div`
  background: #ffffff;
  box-shadow: 0px 0px 4px rgba(222, 222, 222, 0.25),
    0px 0px 32px 4px rgba(220, 220, 220, 0.12);
  border-radius: 2px;
  width: 100%;
  height: 100%;
`;
