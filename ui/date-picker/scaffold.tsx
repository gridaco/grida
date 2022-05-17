import React from "react";
import { default as _DatePicker } from "react-datepicker";
import styled from "@emotion/styled";
import { DatePickerStyle } from "./date-picker-style";
import "react-datepicker/dist/react-datepicker.css";
export const StyledDatePicker = styled(_DatePicker)`
  ${DatePickerStyle}
`;

export { _DatePicker as DatePicker };
