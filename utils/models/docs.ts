export type Docs = {
    type: "file" | "dir" | string;
    fileName: string;
    child?: Docs[];
}