import freshworksWordmark from "../../public/brands/freshworks/wordmark.webp";
import tossWordmark from "../../public/brands/toss/wordmark.webp";
import freshworks from "../../public/brands/freshworks/logo.webp";
import toss from "../../public/brands/toss/logo.webp";
import adidas from "../../public/brands/adidas/logo.png";
import cj from "../../public/brands/cj/logo.png";
import drax from "../../public/brands/drax/logo.png";
import gatorade from "../../public/brands/gatorade/logo.png";
import gwangjin from "../../public/brands/gwangjin/logo.png";
import hyeminHospital from "../../public/brands/hyemin-hospital/logo.png";
import inbody from "../../public/brands/inbody/logo.png";
import kaleg from "../../public/brands/kaleg/logo.png";
import kto from "../../public/brands/kto/logo.png";
import lg from "../../public/brands/lg/logo.png";
import lingtea from "../../public/brands/lingtea/logo.png";
import lotte from "../../public/brands/lotte/logo.png";
import mapmyrun from "../../public/brands/mapmyrun/logo.png";
import mizuno from "../../public/brands/mizuno/logo.png";
import newBalance from "../../public/brands/new-balance/logo.png";
import powerade from "../../public/brands/powerade/logo.png";
import redBull from "../../public/brands/red-bull/logo.png";
import salomon from "../../public/brands/salomon/logo.png";
import samyangRoundhill from "../../public/brands/samyang-roundhill/logo.png";
import seoul from "../../public/brands/seoul/logo.png";
import shinsegae from "../../public/brands/shinsegae/logo.png";
import strig from "../../public/brands/strig/logo.png";
import walkerhill from "../../public/brands/walkerhill/logo.png";

/** Shared brand assets with intrinsic dimensions for raster and SVG artwork. */
export const brands = {
  figma: {
    name: "Figma",
    outlineSymbol: {
      src: "/brands/figma/symbol-outline.svg",
      width: 422,
      height: 605,
    },
    lockup: { src: "/brands/figma/lockup.svg", width: 645, height: 184 },
    logo: { src: "/brands/figma/logo.svg", width: 605, height: 229 },
  },
  bytedance: {
    name: "ByteDance",
    wordmark: { src: "/brands/bytedance/wordmark.svg", width: 197, height: 43 },
    logo: { src: "/brands/bytedance/logo.svg", width: 256, height: 44 },
  },
  replit: {
    name: "Replit",
    wordmark: { src: "/brands/replit/wordmark.svg", width: 802, height: 304 },
    logo: { src: "/brands/replit/logo.svg", width: 1133.22, height: 321.18 },
  },
  freshworks: {
    name: "Freshworks",
    logo: freshworks,
    wordmark: freshworksWordmark,
  },
  toss: { name: "Toss", logo: toss, wordmark: tossWordmark },
  polestar: {
    name: "Polestar",
    symbol: { src: "/brands/polestar/symbol.webp", width: 134, height: 134 },
    logo: { src: "/brands/polestar/logo.svg", width: 101, height: 24 },
  },
  zomato: {
    name: "Zomato",
    symbol: { src: "/brands/zomato/icon.svg", width: 800, height: 800 },
    logo: { src: "/brands/zomato/logo.svg", width: 671, height: 147 },
  },
  cyberagent: {
    name: "CyberAgent",
    wordmark: {
      src: "/brands/cyberagent/wordmark.svg",
      width: 270,
      height: 56,
    },
    logo: { src: "/brands/cyberagent/logo.svg", width: 347, height: 62 },
  },
  adidas: { name: "Adidas", logo: adidas },
  cj: { name: "CJ", logo: cj },
  drax: { name: "DRAX", logo: drax },
  gatorade: { name: "Gatorade", logo: gatorade },
  gwangjin: { name: "Gwangjin", logo: gwangjin },
  hyeminHospital: { name: "Hyemin Hospital", logo: hyeminHospital },
  inbody: { name: "InBody", logo: inbody },
  kaleg: { name: "KALEG", logo: kaleg },
  kto: { name: "KTO", logo: kto },
  lg: { name: "LG", logo: lg },
  lingtea: { name: "Lingtea", logo: lingtea },
  lotte: { name: "Lotte", logo: lotte },
  mapmyrun: { name: "MapMyRun", logo: mapmyrun },
  mizuno: { name: "Mizuno", logo: mizuno },
  newBalance: { name: "New Balance", logo: newBalance },
  powerade: { name: "Powerade", logo: powerade },
  redBull: { name: "Red Bull", logo: redBull },
  salomon: { name: "Salomon", logo: salomon },
  samyangRoundhill: { name: "Samyang Roundhill", logo: samyangRoundhill },
  seoul: { name: "Seoul", logo: seoul },
  shinsegae: { name: "Shinsegae", logo: shinsegae },
  strig: { name: "STRIG", logo: strig },
  walkerhill: { name: "Walkerhill", logo: walkerhill },
} as const;
