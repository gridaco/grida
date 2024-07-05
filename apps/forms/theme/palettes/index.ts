import blue from "./blue";
import gray from "./gray";
import green from "./green";
import neutral from "./neutral";
import orange from "./orange";
import red from "./red";
import rose from "./rose";
import slate from "./slate";
import stone from "./stone";
import violet from "./violet";
import yellow from "./yellow";
import zinc from "./zinc";
import * as hc from "./v-highcontrast";
import * as designer_ryu from "./v-ryu";

export const basic = {
  blue,
  gray,
  green,
  neutral,
  orange,
  red,
  rose,
  slate,
  stone,
  violet,
  yellow,
  zinc,
};

const highcontrast_blue = hc.blue;
const highcontrast_green = hc.green;
const highcontrast_orange = hc.orange;
const highcontrast_red = hc.red;
const highcontrast_violet = hc.violet;
const highcontrast_yellow = hc.yellow;

export const highcontrast = {
  highcontrast_blue,
  highcontrast_green,
  highcontrast_orange,
  highcontrast_red,
  highcontrast_violet,
  highcontrast_yellow,
};

const _001_teal = designer_ryu._001_teal;

export const ryu = {
  "001_teal": _001_teal,
};

// NOTE: do not change the export name as this name is saved in the database
const palettes = {
  ...basic,
  ...highcontrast,
  ...ryu,
};

export default palettes;
