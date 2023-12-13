---
title: As Wrap flag
description: 정적인 디자인에 플래그를 이용한 Wraping 레이아웃 적용하기
id: "--as-wrap"
locale: ko
stage:
  - production
  - staging
  - experimental
---

<!-- This translation is aheaded, more detailed then en -->

# `--as-wrap` - flexbox / Wrap 윗젯 지정 플래그

(피그마를 기준으로 설명합니다.)
디자인툴에서 wrap 과 관련된 반응형 동작을 지원하지 않음에 따라, 우리는 그리드 형태의 디자인을 표현할때 어려움을 겪습니다.

여기서 말하는 Wrap 은 사이즈가 줄어듬에 따라 리스트\*리스트 형의 그리드에서 아이템이 아래로 내려가며 재정렬 되는 것을 말합니다. [(예시 - Flutter#Wrap)](https://api.flutter.dev/flutter/widgets/Wrap-class.html)

이럴때 우리는 Wrap 플래그를 사용하여, autolayout x autolayout 형태로 디자인된 그리드를 자동으로 Wrap 형태로 변환되도록 만들수 있습니다.

```
- autolayout root frame (column)
  - row 1 (autolayout)
  - row 2 (autolayout)
  - row 3 (autolayout)
  - row 4 (autolayout)
```

위와 같이 디자인 하이라키가 구성되었다면, 루트에 간단히 `--as-wrap` 플래그를 추가하면 완성됩니다. (루트가 row 여도 무관합니다. 다만 그럴경우 height 에 의해 자동으로 조정됩니다.)

결과적으로 `row([col([row, row, row]), col([row, row, row])])`) as a `wrap(item, item, item, item, item, item)` 와 같이 하이라키가 변경되게 됩니다.

## Syntax

**허용되는 키**

- `--as-wrap`

```ts
`--as-wrap${"="typeof boolean}`
`--as=wrap` // under development (do not use)
```

## 적용 예시

```
--as-wrap

--as-wrap=true
--as-wrap=false

--as-wrap=yes
--as-wrap=no

----as-wrap
```

## 동작

**엘레먼트 (Element)**

- Web - 웹 에서는 div 인 parent 가 [`flex-wrap`](https://developer.mozilla.org/en-US/docs/Web/CSS/flex-wrap) 의 속성을 띄게 됩니다. (`flex-wrap: wrap`)
- Flutter - 플러터 에서는 [`Wrap`](https://api.flutter.dev/flutter/widgets/Wrap-class.html) 윗젯으로 parent 가 변형됩니다.

_정리하자면, 다음과 같습니다._

- flexbox on css
- Wrap on flutter
- Wrap with reflect-ui

**구조의 변화**
Wrap 이 구성될때, 디자인 상에서는 아이템의 시점에서 루트를 포함하여 2개의 parent 가 존재하지만, 이는 코드상에서 하나의 parent, 즉 Wrap parent 아래에 모든 아이템들이 다이렉트로 있어야 합니다.

위에서도 말한것 처럼 아래와 같이 변형되며,

`row([col([row, row, row]), col([row, row, row])])`) as a `wrap(item, item, item, item, item, item)`

이에 따라 col, col 은 width, height 값이외의 그 어떤값도 최종 코드에 영향을 끼치지 않습니다.

예시를 들어 설명하자면, 아래와 같이 디자인이 구성되었을때 row 3 번만이 갖게 되는 🔴 red 값은 읽히지도, 처리되지도, 결과 코드에 반영되지도 않습니다.
이는 버그가 아니며, 기술적으로 지원이 불가능합니다. (위에 언급을 참조해주세요)

```
- autolayout root frame (column) 🔵
  - row 1 (autolayout) ⚪️
  - row 2 (autolayout) ⚪️
  - row 3 (autolayout) 🔴
  - row 4 (autolayout) ⚪️

🔵 = blue
🔴 = red
⚪️ = transparent (no bg)
```

## 같이보기

- 같이 볼 문서 없음
