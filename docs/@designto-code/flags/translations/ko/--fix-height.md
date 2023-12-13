---
title: Fix Height flag
description: fix-height 플래그를 이용하여 엘레먼트의 height 값 고정하기.
id: "--fix-height"
locale: ko
stage:
  - production
  - staging
  - experimental
---

# `--fix-height` 플래그

적용시, 엘레먼트의 height 값을 parent 또는 child 에 의해 리사이징하지 않고, 고정값을 부여합니다. 현제 디자인 상에서 리사이징에 의해 변화하더라도, fix-height 플래그를 적용하면 엘레먼트의 height 값이 항상 고정됩니다.

## 문법

```ts
`--fix-height${"="typeof boolean}`
```

**적용 예시**

```
--fix-height

--fix-height=true
--fix-height=false

--fix-height=True
--fix-height=False

--fix-height=yes
--fix-height=no
```

## 동작

**변경되는 프로퍼티**
사이즈 고정을 위해, `min`, `max` 값또한 지정되게 됩니다. 플랫폼에 따른 적용 프로퍼티는 다음과 같습니다.

- 웹, css 기반의 모든 프레임워크
  - [`height`](https://developer.mozilla.org/en-US/docs/Web/CSS/height)
  - [`min-height`](https://developer.mozilla.org/en-US/docs/Web/CSS/min-height)
  - [`max-height`](https://developer.mozilla.org/en-US/docs/Web/CSS/max-height)
- Flutter, [`ConstrainedBox`](https://api.flutter.dev/flutter/widgets/ConstrainedBox-class.html) 윗젯 사용
  - `height`
  - `minHeight`
  - `maxHeight`

## 같이보기

- [`--fix-width`](./--fix-width)
