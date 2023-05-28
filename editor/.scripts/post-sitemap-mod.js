const path = require("path");
const fs = require("fs");
const xml2js = require("xml2js");

// Read the existing sitemap.xml
const filePath = path.join(__dirname, "../public/sitemap.xml");
const xml = fs.readFileSync(filePath, "utf-8");

const HOST = "https://code.grida.co";

const additionals = [
  // Add more below for custom sitemap references
  { loc: HOST + "/community/sitemap.xml" },
];

// Parse the XML into a JavaScript object
xml2js.parseString(xml, { explicitArray: false }, (err, result) => {
  if (err) {
    console.error(err);
    return;
  }

  // Check if sitemap is an array or a single object
  if (!Array.isArray(result.sitemapindex.sitemap)) {
    result.sitemapindex.sitemap = [result.sitemapindex.sitemap];
  }

  // Add the new sitemap references
  result.sitemapindex.sitemap.push(...additionals);

  // Convert the JavaScript object back to XML
  const builder = new xml2js.Builder();
  const updatedXml = builder.buildObject(result);

  // Update the sitemap.xml file
  fs.writeFileSync(filePath, updatedXml);

  console.log("Sitemap index updated successfully!");
});
