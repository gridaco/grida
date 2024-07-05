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
import * as satu from "./v-saturation";

// NOTE: do not change the export name as this name is saved in the database
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

// NOTE: do not change the export name as this name is saved in the database
export const highcontrast = {
  highcontrast_blue,
  highcontrast_green,
  highcontrast_orange,
  highcontrast_red,
  highcontrast_violet,
  highcontrast_yellow,
};

const saturation_blue = satu.blue;
const saturation_green = satu.green;
const saturation_orange = satu.orange;
const saturation_red = satu.red;
const saturation_violet = satu.violet;
const saturation_yellow = satu.yellow;

// NOTE: do not change the export name as this name is saved in the database
export const saturation = {
  saturation_blue,
  saturation_green,
  saturation_orange,
  saturation_red,
  saturation_violet,
  saturation_yellow,
};

const ryu_001_teal = designer_ryu._001_teal;

// NOTE: do not change the export name as this name is saved in the database
export const ryu = {
  ryu_001_teal,
};

// NOTE: do not change the export name as this name is saved in the database
const palettes = {
  ...basic,
  ...highcontrast,
  ...saturation,
  ...ryu,
};

export default palettes;
