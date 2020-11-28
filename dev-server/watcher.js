const fs = require("fs");

module.exports = function watcher(entryFolder, fileChangeCallback) {
  const options = { recursive: true };
  fs.watch(entryFolder, options, fileChangeCallback);
};
