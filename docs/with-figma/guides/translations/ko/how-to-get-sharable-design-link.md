---
title: 공유 가능한 Figma 디자인 링크 가져오기
description: 프레임 또는 파일 링크를 복사해 공유하거나 Grida 워크플로우에 사용하는 방법입니다.
keywords:
  - figma
  - 공유 링크
  - 디자인 링크
  - grida
format: md
doc_tasks:
  - update
---

# 공유 가능한 Figma 디자인 링크 가져오기

## 프레임 링크 복사하기

1. Figma 파일을 열고 공유하려는 프레임으로 이동합니다.
2. 프레임을 우클릭합니다.
3. **Copy/Paste as**를 엽니다.
4. **Copy link**를 선택합니다.

이제 해당 프레임으로 바로 연결되는 링크가 복사됩니다. 팀원과 공유하거나 Grida 워크플로우 입력값으로 사용할 수 있습니다.

## 파일 전체 링크 복사하기

1. Figma 파일을 엽니다.
2. 오른쪽 위의 **Share**를 클릭합니다.
3. **Copy link**를 클릭합니다.

복사된 URL에는 다음처럼 `node-id` 쿼리 파라미터가 포함될 수 있습니다.

```txt
https://www.figma.com/file/XXXXXXX/example-file?node-id=0%3A1
```

특정 노드가 아니라 파일 전체를 가리키는 링크가 필요하다면 `?node-id=...` 부분을 제거해 다음 형태로 사용하세요.

```txt
https://www.figma.com/file/XXXXXXX/example-file
```
