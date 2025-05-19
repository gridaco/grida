# [bg.grida.co](https://bg.grida.co)

A lightweight, zero-dependency solution for adding beautiful, interactive backgrounds to your website.

## Why Grida Backgrounds?

- **Zero Dependencies**: No need to manage complex libraries like Three.js or worry about version conflicts
- **Performance Optimized**: Backgrounds run in an isolated iframe, ensuring minimal impact on your main application
- **Easy Integration**: Just add an iframe - no complex setup required
- **Maintenance Free**: We handle all updates and optimizations

## Quick Start

Add this iframe to your HTML:

```html
<iframe
  src="https://bg.grida.co/embed/globe"
  style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; border: none; z-index: -1;"
></iframe>
```

That's it! The background will automatically adapt to your viewport size.

## Available Backgrounds

Visit [bg.grida.co](https://bg.grida.co) to browse and preview available backgrounds. Each background has a unique ID that you can use in the iframe URL.

## Customization

You can customize the background behavior by adding URL parameters:

```html
<iframe
  src="https://bg.grida.co/embed/globe?dark=1"
  style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; border: none; z-index: -1;"
></iframe>
```

Available parameters vary by background - check the documentation for each specific background.

## Performance

- Backgrounds are served from a global CDN
- Automatic quality adjustment based on device performance
- Minimal memory footprint
- No impact on your main application's bundle size

## Support

For questions or custom background requests, please contact us at [grida.co/contact](https://grida.co/contact)
