const path = require("path");
const fs = require("fs");
const uniqid = require("uniqid");

module.exports = function cssLoader(cssFilepath, outputDir) {
  const copiedFilename = path.join(outputDir, `${uniqid()}.css`);
  fs.copyFileSync(cssFilepath, copiedFilename);

  return copiedFilename;
};
