import styled from "@emotion/styled";
import React from "react";
import { useInView } from "react-intersection-observer";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vs } from "react-syntax-highlighter/dist/cjs/styles/prism";
import Typist from "react-typist";

export function CliDemoTypeContent({
  children,
  language,
}: {
  language: string;
  children: React.ReactNode;
}) {
  return (
    <TypistWhenVisible>
      <SyntaxHighlighter language={language} style={{ ...vs, border: "none" }}>
        {children}
      </SyntaxHighlighter>
    </TypistWhenVisible>
  );
}

function TypistWhenVisible({
  children,
  onlyWhenVisible = true,
  isstatic = false,
}: {
  children: React.ReactNode;
  onlyWhenVisible?: boolean;
  isstatic?: boolean;
}) {
  const { ref, inView } = useInView({
    threshold: 0,
  });

  const [triggered, setTriggered] = React.useState(inView);

  React.useEffect(() => {
    if (inView) {
      setTriggered(true);
    }
  }, [inView]);

  const Content = () => {
    if (isstatic) {
      return <>{children}</>;
    }
    if (triggered) {
      return (
        <StyledTypist
          delayGenerator={(m: number, s, c) => {
            if (c.character == " ") {
              return 1;
            }
            return 20;
          }}
          cursor={{
            blink: false,
            show: false,
          }}
        >
          {children}
        </StyledTypist>
      );
    } else {
      if (onlyWhenVisible) {
        return <></>;
      } else {
        return <>{children}</>;
      }
    }
  };

  return <div ref={ref}>{ref && <Content />}</div>;
}

const StyledTypist = styled(Typist)`
  pre {
    border: none !important;
  }
  .Typist .Cursor {
    display: inline-block;
  }
  .Typist .Cursor--blinking {
    opacity: 1;
    animation: blink 1s linear infinite;
  }

  @keyframes blink {
    0% {
      opacity: 1;
    }
    50% {
      opacity: 0;
    }
    100% {
      opacity: 1;
    }
  }
`;
