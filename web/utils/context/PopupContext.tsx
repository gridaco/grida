import React, {
  createContext,
  useContext,
  useState,
  Dispatch,
  SetStateAction,
} from "react";
import { ResponsiveValue, TLengthStyledSystem } from "styled-system";

export interface PopupInfo {
  id?: number;
  width?: ResponsiveValue<TLengthStyledSystem>;
  title: string;
  message?: string;
  element?: JSX.Element;
  height?: ResponsiveValue<TLengthStyledSystem>;
  confirmLabel?: string;
  confirmAction?: () => void;
  closeLabel?: string;
  closeAction?: () => void;
  showOnlyBody?: boolean;
  withoutConfirm?: boolean;
  onDismiss?: () => void;
}

interface PopupState {
  popupList?: PopupInfo[];
  lastPopupId?: number;
}

interface PopupDispatch {
  addPopup: (popupInfo: PopupInfo) => number;
  removePopup: (id?: number) => void;
}

const PopupContext = createContext({});

export const PopupProvider = props => {
  const { children } = props;

  const initialState: PopupState = {
    popupList: [],
    lastPopupId: 0,
  };

  return (
    <PopupContext.Provider value={useState(initialState)}>
      {children}
    </PopupContext.Provider>
  );
};

export const PopupConsumer = PopupContext.Consumer;

export const usePopupContext = (): PopupState & PopupDispatch => {
  const [state, setState] = useContext(PopupContext) as [
    PopupState,
    Dispatch<SetStateAction<PopupState>>,
  ];

  function addPopup(popupInfo: PopupInfo) {
    setState(prev => ({
      ...prev,
      popupList: prev.popupList.concat({
        ...popupInfo,
        id: prev.lastPopupId,
      }),
      lastPopupId: prev.lastPopupId + 1,
    }));
    return state.lastPopupId;
  }

  function removePopup(id?: number) {
    const removeAndUpdate = (prev: PopupState) => {
      return prev.popupList.filter((popup, i) => {
        if (id == undefined) {
          return prev.popupList.length - 1 !== i;
        }
        if (id == popup.id) {
          // emmit dismiss event to closing target popup
          popup.onDismiss?.();
          return false;
        } else {
          return true;
        }
      });
    };
    setState(prev => ({
      ...prev,
      popupList: removeAndUpdate(prev),
    }));
  }

  return {
    ...state,
    addPopup,
    removePopup,
  };
};
