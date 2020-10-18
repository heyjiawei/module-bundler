const fs = require("fs");
const resolve = require("resolve");
const { parse } = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const generate = require("@babel/generator").default;
const t = require("@babel/types");

const {
  resolver: buildDependencyGraph,
  DEPENDENCY_MAP,
} = require("./resolver");

function bundle(entryFile, outputFolder) {
  // Create dependency graph and get dependency map
  buildDependencyGraph(entryFile);

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
  const code = fs.readFileSync(filepath, "utf8");
  const ast = parse(code, {
    sourceType: "module",
    sourceFilename: filepath,
  });

  traverse(ast, {
    ImportDeclaration(path) {
      const source = path.node.source.value;
      const filename = resolve.sync(source, {
        basedir: BASE_DIR,
      });
      path.get("specifiers").forEach((specifier) => {
        if (t.isImportDefaultSpecifier(specifier)) {
          const name = specifier.node.local.name;
          path.replaceWith(
            t.variableDeclaration("const", [
              t.variableDeclarator(
                t.identifier(name),
                t.callExpression(t.identifier("_required"), [
                  t.stringLiteral(filename),
                ])
              ),
            ])
          );
        }
      });
    },
  });

  // TODO: return sourceMap
  const { code: transformedCode, map } = generate(
    ast,
    { sourceMap: true },
    code
  );
  return transformedCode;
}

const BASE_DIR =
  "/home/jiawei/Documents/rk-webpack-clone-master/assignments/02/fixtures/01/code";
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
