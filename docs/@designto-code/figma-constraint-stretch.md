# Constraints - STRETCH

> This document is based on horizontally stretched element. (which applies the same to vertically stretched.)

Before we start, we recommand you to read [Figma Constraint docs](https://www.figma.com/plugin-docs/api/Constraints/). in this document, we only handle `STRETCH`

## Web - Css

**1. using position + l + r**

```css
.container {
  position: relative;
  left: 16px;
  right: 16px;
}
```

**2. using `width: auto`**

```css
.container {
  width: auto; /* which is not required explicitly, since the default value is auto. */
  margin-left: 16px;
  margin-right: 16px;
}
```

**Experimental**
There are css experimental values for width. (This might be a standard way on the future) At this point, no valid documents are available, we do not support below values.

- `width:stretch`
- `width:fill`

_References_

- [mdn css width](https://developer.mozilla.org/en-US/docs/Web/CSS/width)
- [w3 - css-sizing-4 draft](https://www.w3.org/TR/css-sizing-4/)

## Flutter

In flutter or any other platforms, the approach differs.

setting width or height to `double.infinity`

**Using infinity size**

```dart
Container(
    // height: double.infinity, // stretch vertically
    width: double.infinity, // stretch horizontally
    margin: EdgeInsets.all(16), // this will stretch horizontally with 16 spaces.
    child: SomeChild()
);
```

**Using positioned (like css)**

```dart
Stack(                             /* <----- */
    children: [
        Positioned(
            left: 0,               /* <----- */
            right: 0,              /* <----- */
            child: Container(
                margin: EdgeInsets.all(4),
                padding: EdgeInsets.all(4),
                // see here, no infinity size is required /* width: double.infinity, */
                color: Colors.black,
                child: Text('Hello, World!', style: Theme.of(context).textTheme.headline4))
            );
            ]
);
```

## Android

```kt
// does not have to be a column. the important part is `IntrinsicSize.Max`
Column(Modifier.width(IntrinsicSize.Max)) {
    SomeChild()
}
```

## Note - The problem & Good to know

While css can handle all figma constraints (including STRETCH) with `position`, `left`, `right`, `top` and `bottom`, other platform requires additional wrap or modification on different property, which makes the token to break down into deeper level.

There is always a way to use stack + positioned to make it work as the same way css does, but in declarative language, this will get lot massy (long, unreadable code.).
