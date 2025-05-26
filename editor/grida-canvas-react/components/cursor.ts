export namespace cursors {
  const rotate_svg = (angle: number) => {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="24" fill="none">
      <g filter="url(#a)" transform="rotate(${angle}, 13, 12), scale(0.75)">
        <path fill="#000" fill-rule="evenodd" d="M23 15.5h-6.43l2.65-2.79A7.72 7.72 0 0 0 13 9.5a7.72 7.72 0 0 0-6.22 3.21l2.65 2.79H3V8.75l1.74 1.83A10.5 10.5 0 0 1 13 6.5c3.32 0 6.3 1.59 8.26 4.08L23 8.75v6.75Z" clip-rule="evenodd"/>
        <path stroke="#fff" stroke-width=".75" d="M23 15.88h.38V7.8l-.65.68-1.45 1.52A10.85 10.85 0 0 0 13 6.13c-3.3 0-6.25 1.5-8.28 3.88L3.27 8.5l-.64-.68v8.07h7.67l-.6-.64-2.43-2.55A7.32 7.32 0 0 1 13 9.88c2.3 0 4.36 1.08 5.73 2.8l-2.43 2.56-.6.63H23Z"/>
      </g>
      <defs>
        <filter id="a" width="25.1" height="14.1" x=".45" y="4.95" color-interpolation-filters="sRGB" filterUnits="userSpaceOnUse">
          <feFlood flood-opacity="0" result="BackgroundImageFix"/>
          <feColorMatrix in="SourceAlpha" result="hardAlpha" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"/>
          <feOffset dy="1"/>
          <feGaussianBlur stdDeviation=".9"/>
          <feComposite in2="hardAlpha" operator="out"/>
          <feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.65 0"/>
          <feBlend in2="BackgroundImageFix" result="effect1_dropShadow_443_204"/>
          <feBlend in="SourceGraphic" in2="effect1_dropShadow_443_204" result="shape"/>
        </filter>
      </defs>
    </svg>`;
  };

  export const rotate_svg_data = (angle: number) => {
    const svgData = rotate_svg(angle);
    return `data:image/svg+xml;base64,${btoa(svgData)}`;
  };

  export const resize_handle_cursor_map = {
    nw: "nwse-resize",
    n: "ns-resize",
    ne: "nesw-resize",
    e: "ew-resize",
    se: "nwse-resize",
    s: "ns-resize",
    sw: "nesw-resize",
    w: "ew-resize",
  };
}
