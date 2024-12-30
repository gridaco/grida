import { css, Global } from "@emotion/react";

export const GlobalStyles = () => (
  <Global
    styles={css`
      body {
        margin: 0;
      }

      h1,
      h2,
      h3,
      h4,
      h5,
      h6,
      span {
        font-family: Arial, Helvetica, sans-serif;
      }
    `}
  />
);
