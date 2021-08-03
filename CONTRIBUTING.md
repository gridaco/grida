## Contributing

As our all other engines, products this Bridged as well is a opensource project. We are expecting people to build things together, create more, share more with our products. We are honered to have you as our contributor.

## Notice

This documentation is "Work in progress", you may find this page not helpful. meanwhile please join our slack via [link here](https://together.bridged.xyz). Talk to us directly, work with other contributors / users.

## Building

```
git clone --recurse-submodule https://github.com/gridaco/grida
cd grida
yarn
yarn web # or `yarn desktop`
```

## Must before making large scale PR

- [working with submodule packages](https://github.com/bridgedxyz/.github/blob/main/contributing/working-with-submodules.md)
- [how Bridged repo `/packages` are structured](./packages)

## For - Grida Internal Collaborators.

> To fully commit and access to the full private functionalities and private api integration development, you'll need to set up custom `.env` file

```sh
# if no .env is set on each directory

# - for web
cd web && touch .env && echo 'INTERNAL_DEV=true' >.env

# - for desktop
cd desktop && touch .env && echo 'INTERNAL_DEV=true' >.env
```

this will simply create a new .env file that contains `INTERNAL_DEV=true`, which will do below things.

- private api connection via localhost
- verbose logging (configurable)
