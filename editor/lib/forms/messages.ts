import type { FormAgentState } from "../formstate";

export type PlaygroundWindowMessageAction =
  | PlaygroundWindowMessageActionSetSchema
  | PlaygroundWindowMessageActionSetVariablescss
  | PlaygroundWindowMessageActionSetDarkMode;

type PlaygroundWindowMessageActionSetSchema = {
  type: "set_schema";
  schema: string;
};
type PlaygroundWindowMessageActionSetVariablescss = {
  type: "set_variablescss";
  variablescss: string;
};
type PlaygroundWindowMessageActionSetDarkMode = {
  type: "set_dark_mode";
  dark: boolean;
};

export type FormEventMessage = {
  namespace: "forms.grida.co";
} & FormEventMessagePayload;

export type FormEventMessagePayload =
  | FormReadyEventMessage
  | FormLoadedEventMessage
  | FormChangeEventMessage
  | FormSubmitEventMessage
  | FormAgentWindowHashchangeEventMessage
  | FormAgentWindowPopstateEventMessage;

/**
 * when form is ready to handle incoming messages
 * this event will be sent initially once ready, and every 1 second after that
 * @todo NOT IMPLEMENTED YET - interval
 */
type FormReadyEventMessage = {
  type: "messaging_interface_ready";
  initial: boolean;
  ready: true;
};

/**
 * when the main form view is loaded
 */
type FormLoadedEventMessage = {
  type: "form_view_loaded";
  loaded: true;
};

/**
 * when ever a state is changed
 */
type FormChangeEventMessage = {
  type: "change";
} & FormAgentState;

type FormSubmitEventMessage = {
  type: "submit";
};

// window related
type FormAgentWindowHashchangeEventMessage = {
  type: "hashchange";
  newURL: string;
  oldURL: string;
};

type FormAgentWindowPopstateEventMessage = {
  type: "popstate";
};
