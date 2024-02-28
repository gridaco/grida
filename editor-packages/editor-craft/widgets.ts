export const widgets = [
  ["container", "Container"],
  ["text", "Text"],
  ["link", "Link"],
  ["button", "Button"],
  ["icon-button", "Icon Button"],
  ["icon", "Icon"],
  ["icon-toggle", "Toggle Icon"],
  //
  ["image", "Image"],
  ["image-circle", "Circle Image"],
  ["video", "Video"],
  ["audio", "Audio"],

  // Layout
  ["flex", "Flex"],
  ["flex flex-col", "Column"],
  ["flex flex-row", "Row"],
  ["flex wrap", "Wrap"],
  ["flex flex-col wrap", "Wrap Column"],
  ["flex flex-row wrap", "Wrap Row"],
  ["self-stretch", "Spacer"],

  // basic
  ["chip", "Chip"],
  ["chip-select", "Choice Chips"],

  // page components
  ["tabs", "Tabs"],
  ["pagination", "Page View"],
  ["staggered", "Staggered View"],
  ["list", "List View"],

  // input
  ["textfield", "TextField"],
  ["checkbox", "Checkbox"],
  ["switch", "Switch"],
  ["select", "Select (Dropdown)"],
  ["radio", "Radio"],
  ["pincode", "Pincode"],

  // input / numeric
  ["slider", "Slider"],
  ["stepper", "Stepper"],
  ["rating", "Rating"],

  // numeric
  ["progress", "Progress"],
  ["progress-circle", "Progress Circle"],

  ["tooltip", "ToolTip"],
  ["badge", "Badge"],

  ["divider", "Divider"],
  ["divider-vertical", "Vertical Divider"],

  // embeddings
  ["iframe", "iFrame"],
  ["html", "HTML"],
  ["markdown", "Markdown"],
  ["code", "Code"],
  ["pdf", "PDF"],
  ["camera", "Camera"],

  // canvas
  ["signature", "Signature"],

  // map
  // ["map", "Map"],
  // ["map-marker", "Map Marker"],

  // context
  ["locale-select", "Locale Select"],

  // builders
  ["builder-conditional", "Conditional"],
  ["builder-stream", "Stream"],
] as const;

export type WidgetType = typeof widgets[number][0];
