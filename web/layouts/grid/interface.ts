type StartnEndInPage = "page.start" | "page.end";
type StartnEndInContent = "content.start" | "content.end";

type Slices = {
  /** TODO Support Other Divisions
  // 3 Divisions
  "1/3" : string,
  "2/3" : string,
  "3/3" : string,
  // 5 Divisions
  "1/5" : string,
  "2/5" : string,
  "3/5" : string,
  "4/5" : string,
  "5/5" : string,
  // 6 Divisions
  "1/6" : string,
  "2/6" : string,
  "3/6" : string,
  "4/6" : string,
  "5/6" : string,
  "6/6" : string,
  // 7 Divisons
  "1/7" : string,
  "2/7" : string,
  "3/7" : string,
  "4/7" : string,
  "5/7" : string,
  "6/7" : string,
  "7/7" : string,
  */
  // 8 Divisons
  "1/8" : string,
  "2/8" : string,
  "3/8" : string,
  "4/8" : string,
  "5/8" : string,
  "6/8" : string,
  "7/8" : string,
  "8/8" : string,
}

type LayoutVariant = "start" | "end" | "center" | StartnEndInPage | StartnEndInContent | keyof Slices;

type variant = LayoutVariant | string | number;

export type { variant };