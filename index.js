const fs = require("fs");
const resolve = require("resolve");
const acorn = require("acorn");
const walk = require("acorn-walk");
const escodegen = require("escodegen");

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
  const ast = acorn.parse(code, {
    ecmaVersion: 12,
    sourceType: "module",
  });

  walk.simple(ast, {
    ImportDeclaration(node) {
      walk.simple(node, {
        ImportDefaultSpecifier(defaultSpecifierNode) {
          transformImportDefaultSpecifierToVariableDeclaration(
            node,
            defaultSpecifierNode
          );
        },
      });
    },
  });

  return escodegen.generate(ast);
}

function transformImportDefaultSpecifierToVariableDeclaration(
  parentNode,
  specifierNode
) {
  const pathname = resolve.sync(parentNode.source.value, {
    basedir:
      "/home/jiawei/Documents/rk-webpack-clone-master/assignments/02/fixtures/01/code/",
  });

  parentNode.type = "VariableDeclaration";
  parentNode.kind = "const";
  parentNode.declarations = [
    {
      type: "VariableDeclarator",
      id: {
        type: "Identifier",
        name: specifierNode.local.name,
      },
      init: {
        type: "CallExpression",
        callee: {
          type: "Identifier",
          name: "_require",
        },
        arguments: [
          {
            type: "Literal",
            value: pathname,
            raw: `"${pathname}"`,
          },
        ],
      },
    },
  ];
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
