# [bridged.xyz](https://bridged.xyz/)

![](./readme/images/web-landing-main-example.png)

## In case you are looking for roadmap or contribution

- [join slack](https://github.com/bridgedxyz/contributing-and-license#general-contribution) and develop with community
- [general contribution guideline](https://github.com/bridgedxyz/contributing-and-license)
- [roadmap](https://github.com/bridgedxyz/roadmap)

## Design

The design of bridged.xyz website is oppenned and shared, can be found [here](https://www.figma.com/file/Gaznaw1QHppxvs9UkqNOb0/bridged.xyz?node-id=0%3A1)

> This is a [Next.js](https://nextjs.org/) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

First, run the development server:

```bash
## clone submodules & setup
yarn setup
## install dependencies
yarn
## build web as dev mode (next dev)
yarn web
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `pages/index.js`. The page auto-updates as you edit the file.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js/) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/import?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/deployment) for more details.

## Sitemap

- [code.bridged.xyz](https://code.bridged.xyz)
- [design.bridged.xyz](https://design.bridged.xyz)
- [console.bridged.xyz](https://console.bridged.xyz)
- [labs.bridged.xyz](https://labs.bridged.xyz)
- [bridged.xyz/roadmap](https://bridged.xyz/roadmap)
- [bridged.xyz/github](https://bridged.xyz/github)
- [bridged.xyz/products](https://bridged.xyz/products)
- [bridged.xyz/products/dynamic](https://bridged.xyz/products/dynamic)
- [bridged.xyz/products/inappbridge](https://bridged.xyz/products/inappbridge)
- [bridged.xyz/products/schema-studio](https://bridged.xyz/tools/schema-studio)
- [bridged.xyz/products/react](https://bridged.xyz/products/react)
- [bridged.xyz/platforms/flutter](https://bridged.xyz/platforms/flutter)
- [bridged.xyz/plugins](https://bridged.xyz/plugins)
- [bridged.xyz/plugins/figma](https://bridged.xyz/plugins/figma)
- [bridged.xyz/plugins/sketch](https://bridged.xyz/plugins/sketch)
- [bridged.xyz/tools](https://bridged.xyz/tools)

### Sitemap Generate Shell Script

```sh
#!/bin/sh

# After deleting the previous contents, create an empty folder
cd public && rm -rf sitemap && mkdir sitemap
cd .. && cd scripts
printf "\n"


# Code definitions that should be executed
for SITEMAP in 'common' 'whatsnew'; do
    echo "Generating sitemap-${SITEMAP}.xml..."
    # Excute
    node ./sitemap-${SITEMAP}.js
    printf "\n"
done

# compress xml files with gz extension
echo "Compressing generated xml files..."
node ./compress.js
printf "\n"

# Create a representative sitemap.xml file to define which sites are located
echo "Generating sitemap index files..."
node ./sitemap.js
printf "\n"
cd ..

# Send update request to Google based on sitemap uploaded to server
curl http://google.com/ping?sitemap=http://bridged.xyz/sitemap.xml
```
