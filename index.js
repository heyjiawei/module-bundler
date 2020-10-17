const fs = require("fs");
const acorn = require("acorn");
const walk = require("acorn-walk");
const resolve = require("resolve");

const {
  resolver: buildDependencyGraph,
  DEPENDENCY_MAP,
} = require("./resolver");

function bundle(entryFile, outputFolder) {
  // Create dependency graph and get dependency map
  buildDependencyGraph(entryFile);
  console.log(DEPENDENCY_MAP.keys());
  // Create moduleMap
  let moduleMap = "{";
  for (filepath of DEPENDENCY_MAP.keys()) {
    moduleMap += `"${filepath}": (_exports, _require) => { ${transform(
      filepath
    )} },`;
  }
  moduleMap += "}";

  fs.createWriteStream(outputFolder).write(`const moduleMap = ${moduleMap}`);
}

function transform(filepath) {
  return "const hello;";
  // const code = fs.readFileSync(filepath, "utf8");
  // walk.simple(acorn.parse(code), {

  // });
}

const singleEntrypoint =
  "/home/jiawei/Documents/rk-webpack-clone-master/assignments/02/fixtures/01/code/main.js";

bundle(singleEntrypoint, "/home/jiawei/Documents/module-bundler/bundle.js");
// console.log(JSON.stringify(buildDependencyGraph(singleEntrypoint), " ", 2));

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
