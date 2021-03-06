#!/bin/sh

cd web/public && rm -rf sitemap && mkdir sitemap
cd ../../ && cd scripts/sitemap-gen/
printf "\n"


for SITEMAP in 'common' 'whatsnew'; do
    echo "Generating sitemap-${SITEMAP}.xml..."
    node ./sitemap-${SITEMAP}.js
    printf "\n"
done

echo "Compressing generated xml files..."
node ./compress.js
printf "\n"


echo "Generating sitemap index files..."
node ./sitemap.js
printf "\n"
cd ..

curl http://google.com/ping?sitemap=http://bridged.xyz/sitemap.xml