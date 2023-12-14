---
title: "Css box sizing"
version: 0.1.0
revision: 1
---

# Css box sizing

## When both width (or height) and padding is specified.

```css
.content {
  background-color: black;
  box-sizing: content-box; /* css default value is content-box */
  /* box-sizing: undefined; -- this will do the same */

  height: 100px;
  padding: 24px;
}
```

> The actual size will be `h (100) + p (24) * 2 = 148`

This means the design in design tool, the element with height 100 and padding 24 should not be represented like above.

Below, we listed a standard alternatives.

**Using `box-sizing: border-box`**

Using border-box will contain the padding inside its final height. same h & p sepcified, yet we get the height of 100, which is specified in the design, as we want.

```css
.content {
  background-color: black;
  box-sizing: border-box;

  height: 100px;
  padding: 24px;
}
```

**Not having any intrinsic size**

Having padding without any height specified is a valid and recommended styling strategy.

```css
.content {
  background-color: black;

  /* height: 100px; -- height must be NOT specified. */
  padding: 24px;
}
```

In the same way, the flex container or in a item, the same strategy can be used. Describing based on figma auto layout, if the size is `Hug contents`, which means it does not have a `intrinsic size`. Which concludes - there is no need for specifing a size.

**Using `max-height` instead of `height`**

Yet specifing box-sizing property might not be a best solution, it get's redundant, may confuse developer. and also may require additional handling since the whole behaviour being changed.

We can use `max-height` intead of `height` with still using the default box-sizing, yet having the dedicated height originated from design.

```css
.content {
  background-color: black;

  /* height: 100px; -- height must be NOT specified. */
  max-height: 100px; /* -- use this instead height */
  padding: 24px;
}
```

_References_

- [CSS/box-sizing (mdn)](https://developer.mozilla.org/en-US/docs/Web/CSS/box-sizing)

**Border in design and box-sizing: border-box**

> [(from mdn)](https://developer.mozilla.org/en-US/docs/Web/CSS/box-sizing#values) The width and height properties include the content, padding, and border, but do not include the margin. Note that padding and border will be inside of the box. For example, .box {width: 350px; border: 10px solid black;} renders a box that is 350px wide, with the area for content being 330px wide. The content box can't be negative and is floored to 0, making it impossible to use border-box to make the element disappear.

In design editors, we often see that border (or stroke) alignment can be either `inside` | `center` | `outside`. But this is not a valid porperty in css. css border in assumed `inside` border, a outside border is a `outline`. border and outline are similar yet different. we can handle outside stroke in design as a outline in css, but not all properties will be compatitable. This is a separate subject, lean more at [figma-strokes.md](./figma-strokes.md).

_**As a conclusion**_, the border-box sizing will be a adequate choice since the design tools sizing strategy acts like it (somewhat except strokes)

## What about other frameworks?

Let's take a look at flutter's default sizing behaviour.

```dart
Container(
    height: 100,
    padding: EdgeInsets.all(24),
    color: Colors.black,
    width: double.infinity, // to match parent
    child: Text("hi", color: Colors.white)
);
```

> This will behave like css `box-sizing: border-box;`. Again, in flutter, having additional padding does not effect the final sizing (width/height)
