---
title: Artwork flag
id: "--artwork"
locale: ko
stage:
  - production
  - staging
  - experimental
---

# 아트워크 플래그

아트워크 플래그는 그룹 또는 프레임으로 감싸진 디자인을 tree 형태가 아닌, 하나의 아트워크 에셋으로써 지정할수 있는 플래그 입니다. 일러스트나, 아이콘등을 에셋으로써 사용할때 유용합니다. 또는 임베딩되어, 코드로 변환될 필요가 없는 노드를 지정할때도 사용할수 있습니다.

**지정 가능한 키**

- `--artwork`

## 문법

```ts
`--artwork${"="typeof boolean}`
```

## 적용 예시

```
--artwork

--artwork=true
--artwork=false

--artwork=yes
--artwork=no

----artwork
```

## 동작

**인터프리터**

해당 플래그가 반영된다면, 반영된 노드를 기점으로 이미지로 인식, 변환 됩니다. 이후, 하위 노드는 방문하지도, 처리 하지도 않습니다.

**렌더**

- HTML: `<img>` element 로 렌더링 됩니다.
- Flutter: `Image` widget 으로 렌더링 됩니다.

## 같이보기

- [`--export-as`](./--export-as)
