---
title: As Paragraph flag
id: "--as-p"
locale: en
stage:
  - proposal
  - draft
  - experimental
---

# `--as-p` Paragraph 명시 플래그 (Text)

> 이 플래그는 웹 플랫폼을 위한것입니다. 다른 프랫폼에서는 무시되며, 결과물에 아무런 영향을 끼치지 않습니다.

**지정 가능한 키**

- `--as-p`
- `--as-paragraph`
- `--paragraph`

## 문법

```ts
`--as-p${"="typeof boolean}`
```

**적용 예시**

```
--paragraph

--paragraph=true
--paragraph=false

--paragraph=yes
--paragraph=no

----paragraph
```

## 언제 사용하면 좋을까

<!-- shared content between h1~h6 -->

**SEO**

element tag 를 명시하는것은 SEO 에 있어, 필수적입니다. 특히 헤딩일 경우, 그 효과는 더 큽니다.
모바일 앱의 경우, 해당 사항이 없겠지만, 웹어서는 의미에 맞게 h1~h6 과 함께 p 을 지정하는 것이 좋습니다.

## 동작

**엘레먼트 (Element)**
이 플래그가 적용된다면, 해당 노드의 html 생성 엘레먼트는 `<p>` 로 렌더되어 표시됩니다. (이외의 로직에는 영향이 없으며, 태그가 변경되었기에 이에 따른 부작용은 사용자의 커스텀 css 또는 query 에 따라 변경될 수 있습니다.)

**Text style**
아직 p 를 사용함으로써 자동으로 적용되는 텍스트 스타일은 없습니다. 지정 하지 않았을때와 동일한 방식으로 스타일링이 적용됩니다. 다만 기존 글로벌한 스타일에 p 에 대한 텍스트 스타일이 존재한다면, 이는 직접 영향을 받지 않도록 글로벌 스타일을 수정해주어야 합니다.

## 같이보기

- [`--as-h1`](./--as-h1)
- [`--as-h2`](./--as-h2)
- [`--as-h3`](./--as-h3)
- [`--as-h4`](./--as-h4)
- [`--as-h5`](./--as-h5)
- [`--as-h6`](./--as-h6)
- [`--as-p`](./--as-p)
- [`--as-br`](./--as-br)
