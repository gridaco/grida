# use-sys-theme

React hook for getting the system theme with change event tolerence.

## Usage

```tsx
import React from "react";
import useSysTheme from "use-sys-theme";

function SomeStyledApp() {
  const theme = useSysTheme();
  return (
    <div className={theme}>
      <h1>Some Styled App</h1>
    </div>
  );
}
```
