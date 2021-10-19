# Multi Proxied Property on components

## Styled components

> In styled components, the property should be proxied multiple times.

e.g.

In static terms

```tsx
function AppBar() {
  return <AppBarBase>Hello</AppBarBase>;
}

const AppBarBase = styled.div`
  background-color: red;
  color: white;
  font-size: 1.5em;
`;
```

In dynamic terms

```tsx
function AppBar({
  title,
  color = "white",
  textColor = "red",
}: {
  title: string;
  color?: string;
  textColor?: string;
}) {
  return (
    <AppBarBase
      color={color} // proxy 1
      textColor={textColor} // proxy 1
    >
      {title}
    </AppBarBase>
  );
}

const AppBarBase = styled.div<{ color: string; textColor: string }>`
  background-color: ${(p) => p.color}; /* proxy 2 */
  color: ${(p) => p.textColor}; /* proxy 2 */
  font-size: 1.5em;
`;
```
