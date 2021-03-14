import React from "react";
import Link from "next/link";
import { Text } from "rebass";
import Icon from "components/icon";

const ActionItem = ({ label, href }) => {
  return (
    <Link href={href}>
      <span
        className="cusror"
        style={{
          marginRight: "auto",
          color: "#7D7D7D",
          fontSize: 24,
          marginBottom: 25,
          letterSpacing: "0em",
          fontWeight: 500,
          display: "flex",
          alignItems: "center",
        }}
      >
        {label}
        <Icon
          name="arrowDown"
          isVerticalMiddle
          style={{ transform: "rotate(270deg)" }}
        />
      </span>
    </Link>
  );
};

export default ActionItem;
