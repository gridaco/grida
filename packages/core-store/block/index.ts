import { openDB, deleteDB, wrap, unwrap } from "idb";

const dbname = "block-cache";
const dbver = 1;
