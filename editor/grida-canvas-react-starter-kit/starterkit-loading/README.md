# Starterkit loading steps

**Preload (all)**:

- fetch wasm

**Browser Essentials (instant)**:

- canvas size

**UX Constants (optional)**:

- fonts list (available fonts)

**Resources (optional)**:

- fonts
- images

---

| name               | stage  | required | default | description                                                                   | est delay (nocache, 3G) | notes                                |
| ------------------ | ------ | -------- | ------- | ----------------------------------------------------------------------------- | ----------------------- | ------------------------------------ |
| fetch-wasm         | idle   | ✅       | ✅      | Fetch wasm binary (always required, cached)                                   | ~5s (~15mb)             | required                             |
| load-wasm          | idle   | ✅       | ✅      | Load wasm & bind canvas                                                       | -                       | required                             |
| load-document      | doc    | ❌       | ✅      | Load document                                                                 | vary                    | required for reasonable UX           |
| load-user-config   | config | ❌       | ✅      | Load user config, last session data (which page to open, which node to focus) | ~0.5s (~1kb)            | good to have, no cost                |
| sync-canvas        | ui     | ❌       | ✅      | measure and set size of canvas, center stage the contents, sync transforms    | ~0.1s (dom)             | required for reasonable UX           |
| fetch-webfontslist | ui     | ❌       | ✅      | Load fonts list                                                               | ~1s (~1mb)              | required. fonts won't load           |
| res-eager-fonts    | res    | ❌       | ✅      | Fetch all used fonts                                                          | ~10s (~500mb), vary     | required. fonts will fallback        |
| res-eager-images   | res    | ❌       | ❌      | Fetch all used images                                                         | ~20s (~1gb), vary       | not required. image flicker expected |
