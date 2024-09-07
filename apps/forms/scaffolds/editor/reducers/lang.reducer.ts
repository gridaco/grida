import { produce, type Draft } from "immer";
import type { EditorState } from "../state";
import type {
  EditorDocumentLangSetCurrentAction,
  EditorDocumentLangSetDefaultAction,
  EditorDocumentLangAddAction,
  EditorDocumentLangDeleteAction,
  NSEditorDocumentLangAction,
  EditorDocumentLangMessageAction,
} from "../action";
import assert from "assert";
import toast from "react-hot-toast";

export default function langReducer(
  state: EditorState,
  action: NSEditorDocumentLangAction
): EditorState {
  switch (action.type) {
    case "editor/document/langs/set-current": {
      const { lang } = <EditorDocumentLangSetCurrentAction>action;
      return produce(state, (draft) => {
        assert(draft.document.g11n.langs.includes(lang), "Language not found");
        draft.document.g11n.lang = lang;
      });
    }
    case "editor/document/langs/set-default": {
      const { lang } = <EditorDocumentLangSetDefaultAction>action;
      return produce(state, (draft) => {
        if (draft.document.g11n.langs.length === 1) {
          const prevlang = draft.document.g11n.lang;
          draft.document.g11n.langs = [lang];
          draft.document.g11n.lang_default = lang;
          draft.document.g11n.lang = lang;
          // swap the resources lang key
          draft.document.g11n.resources = {
            [lang]: draft.document.g11n.resources[prevlang],
          };
        } else {
          assert(
            draft.document.g11n.langs.includes(lang),
            "Language not found"
          );
          draft.document.g11n.lang_default = lang;
          draft.document.g11n.lang = lang;
          draft.document.g11n.langs = draft.document.g11n.langs
            .slice()
            .sort((a, b) => {
              if (a === lang) return -1;
              if (b === lang) return 1;
              return 0;
            });
        }
      });
    }
    case "editor/document/langs/add": {
      const { lang } = <EditorDocumentLangAddAction>action;
      return produce(state, (draft) => {
        const langs = new Set(draft.document.g11n.langs);
        langs.add(lang);
        draft.document.g11n.langs = Array.from(langs);
        draft.document.g11n.lang = lang;
        draft.document.g11n.resources[lang] = {};
      });
    }
    case "editor/document/langs/delete": {
      const { lang } = <EditorDocumentLangDeleteAction>action;
      return produce(state, (draft) => {
        if (draft.document.g11n.langs.length === 1) {
          toast.error("At least one language is required");
          return;
        }
        const langs = new Set(draft.document.g11n.langs);
        langs.delete(lang);
        draft.document.g11n.langs = Array.from(langs);
        draft.document.g11n.lang = draft.document.g11n.langs[0];
        delete draft.document.g11n.resources[lang];
      });
    }
    case "editor/document/langs/messages/change": {
      const { lang, key, message } = <EditorDocumentLangMessageAction>action;

      return produce(state, (draft) => {
        assert(draft.document.g11n.resources[lang], "Language not found");
        draft.document.g11n.resources[lang]![key] = message;
      });
    }
  }

  return state;
}
