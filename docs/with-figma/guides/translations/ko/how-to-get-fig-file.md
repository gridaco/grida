---
title: Figma에서 로컬 .fig 파일 저장하기
description: Grida로 가져오기 위해 Figma에서 로컬 `.fig` 파일을 다운로드하는 방법입니다.
keywords:
  - figma
  - fig 파일
  - 가져오기
  - grida
format: md
doc_tasks:
  - update
---

# Figma에서 로컬 .fig 파일 저장하기

이 가이드는 Grida로 가져올 수 있도록 Figma에서 `.fig` 파일을 다운로드하는 방법을 설명합니다.

> **참고:** `.fig` 파일 형식은 Figma의 독점 포맷이며 예고 없이 바뀔 수 있습니다. `.fig` 파일 가져오기에 문제가 생기면 [이슈를 남겨 주세요](https://github.com/gridaco/grida/issues) 또는 지원팀에 문의해 주세요.

## 요구 사항

- 최소 **can view** 권한이 있어야 합니다
- 파일 소유자가 복사 및 공유를 제한하지 않아야 합니다
- **Save local copy** 메뉴가 보이지 않으면 파일 소유자에게 문의하세요

## Figma Desktop 또는 Web에서 저장하기

1. Figma 파일을 엽니다.
2. 왼쪽 위의 **Main menu**를 클릭합니다.
3. **File → Save local copy...**로 이동합니다.
4. 저장할 위치를 선택합니다.
5. **Save**를 클릭합니다.

파일은 `.fig` 확장자로 저장됩니다.

## 운영체제별 파일 위치

저장 후 `.fig` 파일은 선택한 위치에서 찾을 수 있습니다.

**macOS**

- 기본 Downloads 폴더: `~/Downloads/`
- 사용자 지정 위치: 저장할 때 직접 선택한 위치

**Windows**

- 기본 Downloads 폴더: `C:\Users\YourUsername\Downloads\`
- 사용자 지정 위치: 저장할 때 직접 선택한 위치

**Linux**

- 기본 Downloads 폴더: `~/Downloads/`
- 사용자 지정 위치: 저장할 때 직접 선택한 위치

## `.fig` 파일에 포함되는 내용

`.fig` 파일에는 다음이 포함됩니다.

- Figma 문서의 모든 페이지(캔버스)
- 속성을 포함한 전체 노드 계층 구조
- 벡터 데이터, 채우기, 스트로크, 효과
- 텍스트 내용과 스타일
- 컴포넌트 정의와 인스턴스

**포함되지 않는 항목:**

- 버전 히스토리
- 댓글
- 원본 Figma 파일과의 연결성(가져온 뒤에는 새 파일처럼 취급됨)

## Grida로 가져오기

`.fig` 파일을 준비했다면:

1. Grida Canvas playground를 엽니다.
2. 왼쪽 위 로고 메뉴를 클릭합니다.
3. **Import Figma**를 선택합니다.
4. **.fig File** 탭에서 **Select .fig File**을 클릭합니다.
5. 다운로드한 `.fig` 파일을 선택합니다.
6. 가져올 페이지를 검토합니다.
7. **Yes, Import**를 클릭합니다.

각 Figma 페이지는 Grida scene으로 변환됩니다.

> **참고:** 가져온 파일의 컴포넌트는 새로운 main component가 됩니다. 인스턴스는 이 새 컴포넌트에 연결되며 원본 Figma 파일의 업데이트를 계속 받지는 않습니다.

## 문제 해결

**`Save local copy` 옵션이 보이지 않을 때**

- 파일 소유자가 복사 및 공유를 제한했을 수 있습니다
- 권한이 충분하지 않을 수 있습니다. 최소 `"can view"` 권한이 필요합니다
- 파일 소유자에게 권한 요청 또는 다운로드를 부탁하세요

**`.fig file` 파싱 실패**

- Figma에서 받은 유효한 `.fig` 파일인지 확인하세요
- 파일을 다시 다운로드해 보세요
- 파일이 손상되지 않았는지 확인하세요
- `.fig` 포맷이 변경되었을 수 있습니다

**페이지를 찾을 수 없음**

- `.fig` 파일이 비어 있거나 캔버스 노드가 없을 수 있습니다
- Figma에서 파일을 열어 실제 콘텐츠가 있는지 확인하세요

## 관련 자료

- [Figma Help: Save a local copy of files](https://help.figma.com/hc/en-us/articles/8403626871063-Save-a-local-copy-of-files)
- [Figma Help: Download files from Figma](https://help.figma.com/hc/en-us/articles/360041003114-Download-files-from-Figma)
- [Figma에서 복사 & 붙여넣기](../../editor/features/copy-paste-figma.md) - 클립보드 기반 대안 가져오기 방식
