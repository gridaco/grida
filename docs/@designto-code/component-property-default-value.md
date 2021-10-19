---
title: Component Property Default value
version: 0.1.0
revision: 1
---

# Component Property Default value

This document demonstrates how assigning a default value differes by frameworks and languages

## Syntax by languages

### React tsx - Syntax

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
    <AppBarBase color={color} textColor={textColor}>
      {title}
    </AppBarBase>
  );
}
```

### React jsx - Syntax

jsx requires [`prop-types`](https://www.npmjs.com/package/prop-types) package to be installed.

```jsx
AppBar.propTypes = {
  color: PropTypes.string,
  textColor: PropTypes.string,
};

AppBar.defaultProps = {
  color: "red",
  textColor: "white",
};
```

_References_

- https://reactjs.org/docs/typechecking-with-proptypes.html#default-prop-values

### Flutter dart - Syntax

```dart
AppBar({
  Key? key,
  Color color = Colors.red,
  Color textColor = Colors.white,
  String title,
}){
    // constructor
}
```

_References_

- https://www.bezkoder.com/dart-flutter-constructors/

### Vue `lang=js` - Syntax

```js
app.component("app-bar", {
  props: {
    title: {
      type: String,
      required: true,
    },
    color: {
      type: String,
      default: "red",
    },
    textColor: {
      type: String,
      default: "white",
    },
  },
});
```

_References_

- https://v3.vuejs.org/guide/component-props.html
- [StackOverflow: Default values for Vue component props & how to check if a user did not set the prop?](https://stackoverflow.com/questions/40365741/default-values-for-vue-component-props-how-to-check-if-a-user-did-not-set-the)

## A Universal redundant way

Or we can optionally use a falsy gate to assign default property inside a body (example based on ts)

```ts
interface AppBarProps {
  color: string;
}

const color = p.color ?? "red";
```
