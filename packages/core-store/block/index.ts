import { openDB, deleteDB, wrap, unwrap } from "idb";

const dbname = "block-cache";
const dbver = 1;
async function prewarm() {
  const db = await openDB(dbname, dbver, {});
  //   const tx = db.transaction("blocks", "readwrite");
  //   tx.store.add({
  //     "": "",
  //   });
}
