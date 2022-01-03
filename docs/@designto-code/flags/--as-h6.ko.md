---
title: As-H6 flag
id: "--as-h6"
locale: ko
stage:
  - production
  - staging
  - experimental
---

# `--as-h6` 헤딩6 명시 플래그

**지정 가능한 키**

- `--as-h6`
- `--as-heading6`
- `--as-headline6`
- `--h6`
- `--heading6`
- `--headline6`

## 문법

```ts
`--h6${"="typeof boolean}`
```

## 적용 예시

```
--h1

--h1=true
--h1=false

--h1=yes
--h1=no

----h1
```

## 언제 사용하면 좋을까

<!-- shared content between h1~h6 -->

**SEO**

element tag 를 명시하는것은 SEO 에 있어, 필수적입니다. 특히 헤딩일 경우, 그 효과는 더 큽니다.
모바일 앱의 경우, 해당 사항이 없겠지만, 웹어서는 의미에 맞게 h1~h6 을 지정하는 것이 좋습니다.

## 동작

**엘레먼트 (Element)**
이 플래그가 적용된다면, 해당 노드의 html 생성 엘레먼트는 `<h6>` 로 렌더되어 표시됩니다. (이외의 로직에는 영향이 없으며, 태그가 변경되었기에 이에 따른 부작용은 사용자의 커스텀 css 또는 query 에 따라 변경될 수 있습니다.)

**텍스트 스타일 (Text style)**
`--h1` 을 적용함으로, 엘레먼트가 수정되더라도, 아직 Grida 는 이에 따른 추가적인 스타일링 지원을 하지 않습니다. 타 `span`, `p`, 와 동일하게 블록단위의 스타일이 지정됩니다. 공용 헤딩 스타일에 대한 Global css 를 지원하지 않습니다.

## 같이보기

- [`--as-h1`](./--as-h1)
- [`--as-h2`](./--as-h2)
- [`--as-h3`](./--as-h3)
- [`--as-h4`](./--as-h4)
- [`--as-h5`](./--as-h5)
- [`--as-p`](./--as-p)
- [`--as-br`](./--as-br)
