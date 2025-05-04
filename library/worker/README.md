# Grida Library Image Processing Worker

Image processing, including:

- embedding
- palette
- metadata

This consumes the supabase queue and annotates the images

---

> hosted on railway

# System Packages

- libcairo2
- libcairo2-dev

Railway config

```.env
RAILPACK_DEPLOY_APT_PACKAGES="libcairo2 libcairo2-dev"
```
