import { Card_001, Card_002 } from "./cards";
import { Hero_001, Hero_002 } from "./cards.hero";

export const template_components = [
  Card_001,
  Card_002,
  Hero_001,
  Hero_002,
].reduce((acc, component) => {
  return {
    ...acc,
    [component.type!]: component,
  };
}, {});
