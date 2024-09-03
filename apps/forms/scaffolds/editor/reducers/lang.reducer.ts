import { produce, type Draft } from "immer";
import type { EditorState } from "../state";
import type {
  EditorAction,
  EditorDocumentLangAction,
  EditorDocumentLangSetDefaultAction,
  EditorDocumentLangAddAction,
  EditorDocumentLangDeleteAction,
} from "../action";
import assert from "assert";
import toast from "react-hot-toast";

export default function langReducer(
  state: EditorState,
  action: EditorAction
): EditorState {
  switch (action.type) {
    case "editor/document/lang": {
      const { lang } = <EditorDocumentLangAction>action;
      return produce(state, (draft) => {
        draft.document.lang = lang;
      });
    }
    case "editor/document/langs/set-default": {
      const { lang } = <EditorDocumentLangSetDefaultAction>action;
      return produce(state, (draft) => {
        if (draft.document.langs.length === 1) {
          draft.document.langs = [lang];
          draft.document.lang_default = lang;
          draft.document.lang = lang;
        } else {
          assert(draft.document.langs.includes(lang), "Language not found");
          draft.document.lang_default = lang;
          draft.document.lang = lang;
          draft.document.langs = draft.document.langs.slice().sort((a, b) => {
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
        const langs = new Set(draft.document.langs);
        langs.add(lang);
        draft.document.langs = Array.from(langs);
        draft.document.lang = lang;
      });
    }
    case "editor/document/langs/delete": {
      const { lang } = <EditorDocumentLangDeleteAction>action;
      return produce(state, (draft) => {
        if (draft.document.langs.length === 1) {
          toast.error("At least one language is required");
          return;
        }
        const langs = new Set(draft.document.langs);
        langs.delete(lang);
        draft.document.langs = Array.from(langs);
        draft.document.lang = draft.document.langs[0];
      });
    }
  }

  return state;
}
