---
title: "Figma rotation"
version: 0.1.0
revision: 1
---

# Figma rotation

![](./assets/figma-rotation-example.png)

<!-- Figma rotation has -179~180 only. -->

> Figma rotation from [figma plugin docs](https://www.figma.com/plugin-docs/api/properties/nodes-rotation/#docsNav)

## Transform?

While figma and other major design tools has both transform value, and explicit rotation value (which can be calculated from transform value), The intuitive way to represent a rotation value is by using a `Rotation` token. Overall all figma node properties, the only two property that has impact to final transform (based on css) is `scale` and `rotation`.

But those two value comes from different property, one from `node#roation` (or `node#relativeTransform`), one from `node#constraint#scale` - a dynamic `scale` representor.

For this reason, while we tokenize the design, we use `Rotation` token rather than `Transform` token.

e.g.

```typescript
// node example (this is a abstract example, the syntax may differ.)
// [scale only example]
{
    rotation: 0,
    constraints: "SCALE"
}
// in this case, only scale property will be assigned to final transform value.
// Step 1 tokenization
Scale(
  scale: aspect_ratio, // a dynamically calculated value to make scale responsive
  child: node
)
// Step 2 merge transform
Transform(
  scale: matrix4, // a scale value that is represented as matrix 4
  child: node
)

// ------------------------------------------
// [rotation only example]
{
    rotation: 30,
    constraints: "MIN"
}
// in this case, only scale property will be assigned to final transform value.
// Step 1 tokenization
Rotation(
  rotation: 30,
  child: node
)

// Step 2 merge transform
Transform(
  rotation: 30,
  child: node
)

// ------------------------------------------
// [rotation + scale example]
{
    rotation: 30,
    constraints: "SCALE"
}

// Step 1 tokenization
Transforms(
	transforms: [
    Rotation(
      rotation: 30
    ),
    Scale(
	    scale: aspect_ratio, // a dynamically calculated value to make scale responsive
	  )
  ]
	child: node
)

// Step 2 merge transform
Transform(
  rotation: 30,
  scale: matrix4,
  child: node
)
```

## Web - css

- [transform](https://developer.mozilla.org/en-US/docs/Web/CSS/transform)
- [rotate](<https://developer.mozilla.org/en-US/docs/Web/CSS/transform-function/rotate()>)
- [rotateZ](<https://developer.mozilla.org/en-US/docs/Web/CSS/transform-function/rotateZ()>)
- [rotate3d](<https://developer.mozilla.org/en-US/docs/Web/CSS/transform-function/rotate3d()>)

**rotate vs rotateZ vs rotate3d**

<!-- 세 함수의 차이는 3D 지원 여부와 z만 표현하느냐 마느냐의 차이입니다. 평면적으로만 사용할 경우 아래 코드는 같은 결과를 보입니다. -->

The difference between the three functions is whether 3D is supported or not and whether only z is expressed. The code below shows the same result when used only flat.

```css
transform: rotate(10deg)
/* equal */
transform: rotateZ(10deg)
/* equal */
transform: rotate3d(0, 0, 1, 10deg)
```

<!-- 셋 다 같은 결과값을 도출할 수 있으나, 3d rotate과 2d rotate은 분리되어야 하기 때문에 2d rotate을 사용합니다.

그리고 rotate와 rotateZ는 [같습니다.](https://www.w3.org/TR/css-transforms-1/#funcdef-rotatez) 그러니 브라우저 호환성이 더 높은 rotate를 사용할 예정입니다. -->

All three can produce the same result, but 2d `rotate` is used because 3d rotate and 2d rotate must be separated.

Also `rotate` and `rotateZ` can be used in the [same](https://www.w3.org/TR/css-transforms-1/#funcdef-rotatez) Terms. Meanwhile we only support `rotate`, which has more compatibility with various browsers.

---

## Flutter

- [RotatedBox](https://api.flutter.dev/flutter/widgets/RotatedBox-class.html)
- [Transform.rotate](https://api.flutter.dev/flutter/widgets/Transform/Transform.rotate.html)
- [RotationTransition - for animation](https://api.flutter.dev/flutter/widgets/RotationTransition-class.html)

**RotateBox vs Transform.rotate**

<!-- RotateBox는 4분할한 값으로 turn을 받으므로, 다양한 degree 값을 표현하기에 적절하지 않습니다.
하지만 Transform.rotate는 다양한 값을 받을 수 있으므로 Transform.rotate 를 선택합니다. -->

`RotateBox` receives a turn with a value represented with Matrix4, so it is not suitable to express various degree values.
Meanwhile we only support `Transform.rotate` since `Transform.rotate` can be represented with single value - `rotation`

**how to set degree**

`degrees * math.pi / 180`

**RotatedBox**

```dart
RotatedBox(
    quarterTurns: 0,
    child: child
);
```

**Transform.rotate**

```dart
Transform.rotate(
    angle: 90 * math.pi / 180,
    child: child
);
```

## Rotation as Animated value

> Rotation Animation is a working draft - the flag & code gen is not supported.

<!-- design to code는 디자인 그 자체를 코드로 변형하여 사용자의 잡무 없이 바로 사용할 수 있도록 하는 것이 목표입니다. 대부분의 rotation이 사용되는 경우는 크게 두 가지가 있는데 하나는 고정된 형태를 여러 개의 각도에서 돌려 사용하는 경우, 나머지는 하나는 애니메이션입니다.

유저가 애니메이션용으로 해당 도형을 돌리는 경우를 생각하면, 애니메이션이지만, 멈춰져있는 애니메이션으로 제공하는 것이 사용성 면에서 더 뛰어납니다. 그러므로 우리는 멈춰져있는 애니메이션으로 제공합니다. -->

The goal of `design to code` is to transform the design itself into code so that users can use it right away without any chores. There are two main cases where most rotations are used. One is when a fixed form is rotated from multiple angles, and the other is animation.

Considering the case where the user rotates the corresponding figure for animation, it is an animation, but it is better in terms of usability to provide it as a stopped animation. Therefore, we provide it as a frozen animation.

```typescript
// you can set this via setting a animation flag

// if animated, rotation value rather than 0 will automatically interpreted as rotation transition
node.name = "--animated";

// if `animated-rotation` flag is givven, we will always interpret the rotation as animated value (even if it is 0)
node.name = "--animated-rotation";
```

**Flutter#RotationTransition (For animation)**

```dart
// WIP
```

**Css / js - rotate animation**

```css
/* WIP */
```

## Note for assistant

On assistant, on a plugin version, the assets are exported as-is including the rotated snapshot. which means having rotation on already rotated image will cause incorrect visualization. i.e having 30 rotated triangle vector, the graphics exports as-is, in total 60 rotated visually.

## Read Also

- [figma scale](./figma-scale.md)
