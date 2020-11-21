const path = require("path");
const fs = require("fs");

module.exports = function fileLoader(filepath, outputDir) {
  const filename = filepath.split("/").pop();
  const copiedFilename = path.join(outputDir, filename);
  fs.copyFileSync(filepath, copiedFilename);

  return copiedFilename;
};
