const { resolver, DEPENDENCY_MAP } = require("./resolver");

function bundle(entryFile, outputFolder) {
  resolver(entryFile);

  for (filepaths of DEPENDENCY_MAP.keys()) {
    console.log(filepaths);
  }
}

const singleEntrypoint =
  "/Users/jiawei.chong/Documents/rk-webpack-clone/assignments/02/fixtures/01/code/main.js";

bundle(singleEntrypoint);
// console.log(JSON.stringify(resolver(singleEntrypoint), " ", 2));

/**
 output a file like that executes itself. File looks sth like this:

 ```js
 import a from 'a.js'
 export default a;
 ```
 
 ((entryFile) => {
  const exportsMap = {};
  const moduleMap = { 
    0: (exportToPopulate, getModule) => {
      const a = getModule('a.js').default;
      // copied contents of entry file
      exportsToPopulate.default = a;
    },
    'a.js': (exportToPopulate, getModule) => {
      // copied contents of entryFile
    }
  };
  
  function getModule(filepath) {
    if (exportsMap[filepath]) return exportsMap[filepath];
    exportsMap[filepath] = {};

    return moduleMap[filepath](exportsMap[filepath], getModule)
  }

  return getModule(entryFile);
 })(0)
 */
