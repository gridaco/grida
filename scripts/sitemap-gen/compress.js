const fs = require('fs');
const zlib = require('zlib');

var createDir = '../../web/public/sitemap';
var dir = '../../web/public';

fs.readdirSync(dir).forEach((file) => {
    if (file.endsWith('.xml')) {
        // gzip
        const fileContents = fs.createReadStream(dir + '/' + file);
        const writeStream = fs.createWriteStream(createDir + '/' + file + '.gz');
        const zip = zlib.createGzip();

        fileContents
            .pipe(zip)
            .on('error', (err) => console.error(err))
            .pipe(writeStream)
            .on('error', (err) => console.error(err));
    }
});