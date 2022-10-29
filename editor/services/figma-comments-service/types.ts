import { Comment as RawComment } from "@design-sdk/figma-remote-api";

export interface Comment extends RawComment {
  readonly replies: Reply[];
}

export type Reply = RawComment;
