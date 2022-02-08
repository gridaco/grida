import React, { useEffect, useState } from "react";
import { IField, LanguageType, Option } from "@code-ui/docstring/dist/lib/type";
import { Docstring as DocstringView } from "@code-ui/docstring";
import {
  FrameworkOption,
  getpreset,
  Language,
  all_preset_options_map__prod,
  lang_by_framework,
  ReactOption,
  VanillaOption,
  FlutterOption,
  react_styles,
} from "./framework-options";
import styled from "@emotion/styled";

type DesigntoCodeUserOptions = FrameworkOption;

// FIXME: get useroption as props from parent. userprops & preset (optional) should be managed on its parent
interface CodeOptionsControlProps {
  customFields?: IField[];
  fallbackPreset?: string;
  initialPreset?: string;
  onUseroptionChange: (op: DesigntoCodeUserOptions) => void;
}

export function CodeOptionsControl(props: CodeOptionsControlProps) {
  const __presetname = props.initialPreset ?? props.fallbackPreset;
  const [presetname, setPresetname] = React.useState<string>(__presetname);
  const [useroption, setUseroption] = React.useState<DesigntoCodeUserOptions>(
    all_preset_options_map__prod[__presetname]
  );

  useEffect(() => {
    // trigger initial value
    props.onUseroptionChange(useroption);
  }, []);

  // FIXME: this should be fixed on https://github.com/gridaco/code-like-ui (view CURSOR)
  const __dirty_sort_framework = (): Option<string>[] => {
    const presets = [
      {
        name: "React",
        value: "react_default",
        description: "(default)",
      },
      {
        name: "React",
        value: "react_with_styled_components",
        description: "with styled-component",
      },
      {
        name: "React",
        value: "react_with_inline_css",
        description: "with inline-css",
      },
      {
        name: "Flutter",
        value: "flutter_default",
        description: "flutter",
      },
      {
        name: "Vanilla",
        value: "vanilla_default",
        description: "vanilla Html",
      },
    ];

    /* !CURSOR! */
    const sorted_plats: Option<string>[] = presets.sort((o) => {
      if (o.value == presetname) {
        return -1;
      }
      return 1;
    });
    return sorted_plats;
  };

  /**
   * actually platform preset
   */
  const platform_field_config: IField = {
    tag: "@",
    name: "platform", // actually platform preset
    template: `{{ tag }}{{ name }} {{ options.name }} `,
    options: __dirty_sort_framework(),
  };

  const getreactstyle = (frameworkPreset: string) => {
    const preset = getpreset(frameworkPreset) as ReactOption;
    const selected_styling = preset.styling;
    const sorted_langs = [
      selected_styling,
      /* remove target item // - https://developer.mozilla.org/ko/docs/Web/JavaScript/Reference/Global_Objects/Array/splice */
      ...react_styles.splice(1, 0, selected_styling),
    ];
    return sorted_langs;
  };

  const react_style_field_config: IField = {
    tag: "@",
    name: "style", // actually platform preset
    template: `{{ tag }}{{ name }} {{ options.name }} `,
    options: getreactstyle(presetname).map((l) => {
      return {
        name: l,
        value: l,
      };
    }),
  };

  const getlang = (frameworkPreset: string) => {
    const preset = getpreset(frameworkPreset);
    // if user has selected preest, get framework value by preset name, otherwise get the selected framework via `useroption`
    let frameowrk = preset?.framework ?? useroption.framework;

    const langoptions = lang_by_framework[frameowrk];
    const selected_lang = preset.language;
    const sorted_langs = [
      selected_lang,
      /* remove target item // - https://developer.mozilla.org/ko/docs/Web/JavaScript/Reference/Global_Objects/Array/splice */
      ...langoptions.splice(1, 0, selected_lang),
    ];
    return sorted_langs;
  };

  const lang_field_config: IField = {
    tag: "@",
    name: "lang",
    template: `{{ tag }}{{ name }} {{ options.name }} `,
    options: getlang(presetname).map((l) => {
      return {
        name: l,
        value: l,
      };
    }),
  };

  const fields_config = {
    react: [platform_field_config, lang_field_config, react_style_field_config],
    flutter: [platform_field_config, lang_field_config],
    vanilla: [platform_field_config, lang_field_config],
  };

  function onChagne(field: string, value: string) {
    // console.log("code-screen-control::onChagne", field, value);
    // platform here stands for platform preset
    if (field === "platform") {
      const preset = getpreset(value);
      setPresetname(value);
      setUseroption({ ...preset });
      props.onUseroptionChange({ ...preset });
    } else if (field === "lang") {
      let op: FrameworkOption;
      switch (value) {
        case "tsx":
        case "jsx":
          op = {
            ...useroption,
            language: value, // TODO: add generic type checker
          } as ReactOption;
          setUseroption(op); // FIXME: state from p
          props.onUseroptionChange(op);
          break;

        case "dart":
          op = {
            ...useroption,
            language: Language.dart,
          } as FlutterOption;
          setUseroption(op); // FIXME: state from p
          props.onUseroptionChange(op);
          break;
        case "html":
          op = {
            ...useroption,
            language: Language.html,
          } as VanillaOption;
          setUseroption(op); // FIXME: state from p
          props.onUseroptionChange(op);
          break;
        default:
          throw `This lang (${value}) is not currently supported.`;
      }
    }
  }

  const _controls = [
    ...(props.customFields ?? []),
    ...fields_config[useroption.framework],
  ];

  // console.log("code-screen-control::useroption", useroption);
  return (
    <Wrapper>
      <DocstringView
        key={JSON.stringify(useroption)}
        lang={__lang_to_docstring_lang(useroption.language)}
        theme={"monokai"}
        padding={"16px"}
        controls={_controls}
        expandableConfig={{
          lines: 2,
          expandable: true,
          hidable: true,
        }}
        onChange={onChagne}
      />
    </Wrapper>
  );
}

function __lang_to_docstring_lang(lang: Language): LanguageType {
  switch (lang) {
    case Language.dart:
      return "dart";
    case Language.jsx:
    case Language.tsx:
      return "js";
  }
}

const Wrapper = styled.div`
  div,
  ul {
    font-family: "Source Code Pro", "Courier New", "Lucida Console", Monaco;
  }
`;
