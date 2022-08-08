---
id: cli
title: "CLI"
---

# CLI

Grida CLI 는 디자인을 마치 모듈처럼 관리할수 있도록 도와주는 일종의 패키지 매니저 입니다. 간단히는 디자인 모듈을 임포트하여 프로젝트에 사용하거나, 응용으로는 디자인을 바탕으로 CI/CD 파이프라인을 구축할수도 있습니다.

## CLI 설치하기

```
npm i -g grida
```

> 노트: 프로젝트별로 grida 를 설치하는것이 권장됩니다. (글로벌 설치 대신) - `yarn add --dev grida` 또는 `npm i --save-dev grida`.

## `grida init`

우선 `grida init` 를 사용하여 프로젝트를 셋업해야 합니다.
grida init 은 기존에 있는 node (react, rn, svelte, ...) (with package.json) 또는 dart/flutter (with pubspec.yaml) 에서 실행 가능하며 빈 디렉토리어세 실행할경우 grida 가 새로운 프론트엔드 프로젝트를 우선 셋업하게 됩니다.

**기존 프로젝트가 없을경우**

기존 프로젝트가 없을 경우, 아래와 같은 메세지가 나옵니다.

```
$ grida init
> No project root is found (package.json or pubspec.yml) with framework configuration. Do you want to continue without creating a project? (y/N)
```

- No (default) - grida 가 우선 베이스 프로젝트를 셋업할수 있도록 가이드 합니다.
- Yes - 베이스 프로젝트 없이 셋업을 계속합니다. 이는 이후 configuration 이 망가질수 있음으로 추천하지 않습니다. 먼저 베이스 프로젝트 (기존 프로젝트) 를 생성해주세요.

### 1. 디자인 소스 설정

```
> Where from to import your design? : figma
> Please enter your figma file url : https://www.figma.com/file/xxx
> Please enter your figma personal access token.: ******************
```

- origin : 디자인 소스를 어디서 가져올지 선택합니다.
- file : 파일을 선택합니다.
- token : 파일에 접근할수 있는 [personal-access-token]() 을 발급받아 입력합니다.

## `grida add`

grida add 는 패키지 매니저와 비슷하게 작동합니다. `grida add [modules...]` 의 형식으로 사용합니다.

```

```

<!-- ## `grida login` -->
