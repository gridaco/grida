import React from "react";
import { default as _DatePicker, ReactDatePickerProps } from "react-datepicker";
import styled from "@emotion/styled";
import { DatePickerStyle } from "./date-picker-style";

export function DatePicker(props: ReactDatePickerProps) {
  return (
    <StyleRoot>
      <_DatePicker {...props} />
    </StyleRoot>
  );
}

const StyleRoot = styled.div`
  ${DatePickerStyle}
`;

// export { _DatePicker as DatePicker };
