import { Comment as RawComment } from "@design-sdk/figma-remote-api";

export interface Comment extends RawComment {
  readonly replies: Reply[];
}

export type Reply = RawComment;

export type ReactionEmoji =
  | ":eyes:"
  | ":heart_eyes:"
  | ":heavy_plus_sign:"
  | ":+1:"
  | ":-1:"
  | ":joy:"
  | ":fire:";
