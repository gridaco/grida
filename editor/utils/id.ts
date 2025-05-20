import { nanoid } from "nanoid";

export const draftid = () => "[draft]" + nanoid();
export const isDraftId = (id: string) => id.startsWith("[draft]");
