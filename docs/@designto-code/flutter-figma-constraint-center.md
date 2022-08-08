# How to accurately implement Figma's center constraint on Flutter (`%` positioning)

This document describes breifly about how figma handles the center alignment, and how it's different from flutter standard.

First, read [figma-constraint-center](./figma-constraint-center.md)

## Why not `Center()`?

## Why not `Positioned()` ?

## Using `Alignment`

if vertical and horizontal are both biased and center-aligned, then we can use `Align` & `Alignment` under `Stack`.

```dart
Stack(
  children: [
    Align(
      alignment: Alignment(-1.0 + x * 2, -1.0 + y * 2), // where x and y percentage by x and y
      child: child,
    ),
    // ...
  ],
)
```

## Using `Center`

If the item is both centered in vertical & horizontal, then we can use `Center` under `Stack`.
This cannot be applied to biased elements. (only true center, 0.5, 0.5)

```dart
Stack(
  children: [
    Center(
      child: child,
    ),
  ],
)
```

## Using `Padding` & `Align`

```dart
Stack(
  children: [
    Padding(
      padding: EdgeInsets.only(top: 80), // top
      child: Align(
        alignment: Alignment.topCenter, // horizontal center
        child: Container(
          width: 75,
          height: 75,
          decoration: BoxDecoration(
          color: Colors.red
          ),
        )
      )
    )
  ]
)
```

With same technique, we can also use `Row` / `Column` & `mainAxisAlignment: MainAxisAlignment.center` but this does not represent the original design as-is.

## Using `Container` with `margin` & `alignment`

```dart
// if the item is horizontally centered (no bias) and aligned to top 100px.
Container(
        // margin replaces `Positioned`.
        margin: : EdgeInsets.only(top: 100, right: 272),
        // alignment replaces `Align`
        alignment: Alignment.topCenter,
        child: child
);
```

## Using `Positioned.fill` and `LayoutBuilder`

## Fallbacks

- Center centered center-aligned item to
- Fallback left-sided center-aligned item to `Positioned(left: x)`
- Fallback right-sided center-aligned item to `Positioned(right: x)`
- Fallback top-sided center-aligned item to `Positioned(top: y)`
- Fallback bottom-sided center-aligned item to `Positioned(bottom: y)`

## Related lints

To prevent this from happening (unless intended) is to run lints on figma design first, check if any layers have wrong center alignment while they actually should be having left or right alignment.
