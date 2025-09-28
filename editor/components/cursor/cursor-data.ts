export namespace cursors {
  /**
   * - size 72x72
   * - center 32x32 (0.45 * width, 0.45 * height) (0.444..)
   *
   * @preview
   * ![default](https://github.com/gridaco/grida/blob/canary/editor/public/assets/css-cursors-grida/default-64-x28y28-000000.png?raw=true)
   */
  const template_default_svg = (
    width: number = 64,
    height: number = 64,
    fill: string = "#000",
    hue: string = "#fff"
  ) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" fill="none" viewBox="0 0 64 64"><g filter="url(#a)"><path fill="${fill}" d="M26.366 30.143c-.992-2.38 1.396-4.77 3.777-3.777l18.436 7.681c2.54 1.058 2.303 4.73-.35 5.454l-5.265 1.436a2.889 2.889 0 0 0-2.027 2.027L39.5 48.228c-.724 2.654-4.396 2.89-5.454.351l-7.681-18.436Z"/><path stroke="${hue}" stroke-width="1.55" d="M27.076 29.847c-.727-1.746 1.025-3.498 2.77-2.77l18.437 7.68c1.861.777 1.688 3.47-.257 4l-5.265 1.437a3.659 3.659 0 0 0-2.567 2.567l-1.437 5.265c-.53 1.945-3.223 2.118-4 .257l-7.68-18.436Z"/></g><defs><filter id="a" width="35.777" height="35.777" x="20.357" y="22.283" color-interpolation-filters="sRGB" filterUnits="userSpaceOnUse"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feColorMatrix in="SourceAlpha" result="hardAlpha" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"/><feOffset dy="1.926"/><feGaussianBlur stdDeviation="2.889"/><feComposite in2="hardAlpha" operator="out"/><feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.45 0"/><feBlend in2="BackgroundImageFix" result="effect1_dropShadow_3436_1176"/><feBlend in="SourceGraphic" in2="effect1_dropShadow_3436_1176" result="shape"/></filter></defs></svg>`;

  const template_rotate_svg = (angle: number) => {
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

  const _default_png_url =
    "/assets/css-cursors-grida/default-64-x28y28-000000.png";
  export const default_png = {
    url: _default_png_url,
    css: pngsetcss(_default_png_url, 28, 28),
  };

  export const default_svg = {
    data: (
      width: number = 32,
      height: number = 32,
      fill: string = "#000",
      hue: string = "#fff"
    ) => {
      const svgData = template_default_svg(width, height, fill, hue);
      return `data:image/svg+xml;base64,${btoa(svgData)}`;
    },
    url: (
      width: number = 32,
      height: number = 32,
      fill: string = "#000",
      hue: string = "#fff"
    ) => {
      const svgData = default_svg.data(width, height, fill, hue);
      return `url(${svgData})`;
    },
    css: (
      width: number = 32,
      height: number = 32,
      fill: string = "#000",
      hue: string = "#fff"
    ) => {
      const svgData = default_svg.data(width, height, fill, hue);
      return `url(${svgData}) ${width * 0.45} ${height * 0.45}, default`;
    },
  };

  export const rotate_svg_data = (angle: number) => {
    const svgData = template_rotate_svg(angle);
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

  function pngsetcss(
    url: string,
    x: number,
    y: number,
    keyword: string = "default"
  ) {
    return `image-set(url("${url}") 2x, url("${url}") 1x) ${x / 2} ${y / 2}, ${keyword}`;
  }
}
