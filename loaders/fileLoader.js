const path = require("path");
const fs = require("fs");
const uniqid = require("uniqid");

module.exports = function fileLoader(filepath, outputDir) {
  const newFilename = `${uniqid()}${path.extname(filepath)}`;
  fs.copyFileSync(filepath, path.join(outputDir, newFilename));

  return newFilename;
};
