---
id: cli
title: "CLI"
locale: ko
---

# CLI

<!-- ![introducing grida cli - a cli for your figma design](../../assets/supercharged-with-cli.png) -->

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

신규프로젝트 또는 기존프로젝트에 `grida init` 을 완료 하였다면 자동으로 디자인 소스를 설정하는 프롬프트가 아래와 같이 표시됩니다.

```
> Where from to import your design? : figma
> Please enter your figma file url : https://www.figma.com/file/xxx
> Please enter your figma personal access token.: ******************
```

- origin : 디자인 소스를 어디서 가져올지 선택합니다. (figma, sketch, ...)
- file : 파일을 선택합니다.
- token : 파일에 접근할수 있는 [personal-access-token](../../with-figma/guides/how-to-get-personal-access-token) 을 발급받아 입력합니다.

### 2. 프레임워크 설정

디자인 소스 설정 완료후, 프레임워크 설정을 위해 grida 가 몇가지 질문을 합니다.
이는 각 프레임워크 별로 다르며, 자세한 스펙은 [`@grida/builder-config`](https://github.com/gridaco/code/tree/main/packages/builder-config) 에서 확인할수 있습니다.

cli 의 안내를 따라주시면 되며, 이후 니즈에 따라 grida.config.js 에서 아래 영역을 수동을 수정할수 있습니다.

**React 의 예시**

```js
/**
 * @type {import('@grida/builder-config').FrameworkConfig}
 */
const frameworkConfig = {
  framework: "react",
  language: "tsx",
  component_declaration_style: {
    exporting_style: {
      type: "export-named-functional-component",
      declaration_syntax_choice: "function",
      exporting_position: "with-declaration",
    },
  },
};
```

### 프로젝트 구조

grida init 을 통해 정상적으로 프로젝트가 셋업 되었다면 아래와 같이 디렉토리가 설정됩니다.

**For example, NextJS**

```
...
├── .grida             (created)
├── .env               (modified)
├── .gitignore         (modified)
├── README.md
├── grida              (created)
│   └── .gitkeep       (created)
├── grida.config.js    (created)
├── next-env.d.ts
├── package.json       (modified)
├── pages
│   ├── _app.tsx
│   └── index.tsx
├── public
├── styles
├── tsconfig.json
└── ...
```

**For example, Flutter**

```
...
├── .grida                   (created)
├── .env                     (modified)
├── .gitignore               (modified)
├── README.md
├── analysis_options.yaml
├── build
├── flutter_app.iml
├── grida.config.js
├── lib
│   ├── grida                (created)
│   │   └── .gitkeep
│   └── main.dart
├── pubspec.lock
├── pubspec.yaml
├── test
│   └── widget_test.dart
├── web
├── macos
├── ios
├── landroid
├── linux
├── windows
└── ...
```

## `grida add`

grida add 는 패키지 매니저와 비슷하게 작동합니다. `grida add [modules...]` 의 형식으로 사용합니다.

```
grida add [modules...]
# use project configuration
grida add
# add specific design module
grida add <modules...>
```

**아무 arguments 없이 `grida add` 사용하기**

아무 arguments 없이 `grida add` 를 실행할경우, 어떤 모듈을 더할지 cli 에서 자동으로 관리해 줍니다. 하지만 이는 디자인의 이름으로 선택해야 하기때문에 예상과 다른 디자인을 임포트하는 실수를 유발하기 쉽습니다. `grida add` 에 타겟 모듈을 명시하여 사용하는것을 추천드립니다.

**Adding package**

> `grida add <module>`

**Adding package with figma url**

`grida add <figma-url>` 의 형태로 아래와 같이 사용할수 있습니다.

> 만약 figma url 이 파일 전채나, 페이지를 가르킬 경우, 많은 모듈이 한번에 임포트 되수 있기에 프레임 단위의 url 을 사용하는것을 추천드립니다.

```bash
$ grida add https://www.figma.com/file/x7RRK6RwWtZuNakmbMLTVH/examples?node-id=2422%3A10181

# or you can add with id only (the target should be a node that is inside the file you have in grida.config.js)

$ grida add 2422:10181
```

추가된 페키지는 기본설정에 따라 `/grida` 또는 `/lib/grida` (flutter) 에 추가 됩니다. (grida.config.js 에 추가 설정이 없을경우)

이제, 작업중인 메인 파일에 돌아가, 모듈을 임포트 할수 있습니다.

예시로 (react), `pages/index.tsx` 에서, 아래와 같이 사용될수 있습니다.

```tsx
import { NewModuleFromFigma } from "../grida/new-module-from-figma";

export default function() {
  return (
    <>
      {/* ... */}
      <NewModuleFromFigma />
      {/* ... */}
    </>
  );
}
```

## See also

- [Grida CLI @ disquiet.io](https://disquiet.io/product/figma-cli-by-grida)
