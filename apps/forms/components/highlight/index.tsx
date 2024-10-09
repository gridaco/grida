import React, { memo, useMemo } from "react";

interface HighlightProps {
  text?: string;
  tokens?: string[] | string;
  highlightClassName?: string;
  className?: string;
}

const Highlight: React.FC<HighlightProps> = ({
  text,
  tokens,
  highlightClassName,
  className,
}) => {
  const regex = useMemo(() => {
    if (!tokens || tokens.length === 0) {
      return null;
    }

    if (typeof tokens === "string") {
      return new RegExp(`(${tokens})`, "gi");
    }

    return new RegExp(`(${tokens.join("|")})`, "gi");
  }, [tokens]);

  const parts: string[] = useMemo(() => {
    if (!text) {
      return [];
    }

    if (!regex) {
      return [text];
    }

    return text.split(regex);
  }, [text, regex]);

  return (
    <span>
      {parts.map((part, index) =>
        regex && regex.test(part) ? (
          <span key={index} className={highlightClassName}>
            {part}
          </span>
        ) : (
          <span key={index} className={className}>
            {part}
          </span>
        )
      )}
    </span>
  );
};

export default memo(Highlight);
