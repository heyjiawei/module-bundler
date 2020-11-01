const path = require("path");
const fs = require("fs");
const resolve = require("resolve");
const { parse } = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const generate = require("@babel/generator").default;
const t = require("@babel/types");
const template = require("@babel/template").default;

const { resolver: buildDependencyGraph } = require("./resolver");

let BASE_DIR;

function bundle(entryFile, outputFolder) {
  BASE_DIR = path.dirname(entryFile);

  // Create output folder if it doesn't exist
  if (!fs.existsSync(outputFolder)) {
    fs.mkdirSync(outputFolder);
  }
  const outputFilepath = path.join(outputFolder, "index.js");
  const dependencyMap = new Map();
  buildDependencyGraph(entryFile, dependencyMap);

  // Create moduleMap
  let moduleMap = "{";
  for (filepath of dependencyMap.keys()) {
    moduleMap += `"${filepath}": (_exports, _require) => { ${transform(
      filepath
    )} },`;
  }
  moduleMap += "}";

  const entryFilename = resolve.sync(entryFile, {
    basedir: BASE_DIR,
  });

  fs.writeFileSync(
    outputFilepath,
    `
  ((entryFile) => {
    const moduleMap = ${moduleMap};
    const exportsMap = {};

    function getModule(filepath) {
      if (exportsMap[filepath] == null) {
        exportsMap[filepath] = {};
        moduleMap[filepath](exportsMap[filepath], getModule);
      }
      return exportsMap[filepath];
    }

    return getModule(entryFile);
  })("${entryFilename}")
  `
  );
  return outputFilepath;
}

function transform(filepath) {
  const code = fs.readFileSync(filepath, "utf8");
  const ast = parse(code, {
    sourceType: "module",
    sourceFilename: filepath,
  });

  traverse(ast, {
    ImportDeclaration(path) {
      handleImportDeclaration(path);

      // // const source = path.get("source").node.value;
      // const filepath = getAbsolutePath(path.get("source").node.value);
      // // const filename = resolve.sync(source, {
      // //   basedir: BASE_DIR,
      // // });

      // /**
      //  * import './a'
      //  */
      // if (path.get("specifiers").length === 0) {
      //   // const pathname = resolve.sync(path.get("source").node.value, {
      //   //   basedir: BASE_DIR,
      //   // });
      //   const ast = template(`
      //     _require('${getAbsolutePath(filepath)}')
      //   `)();
      //   path.replaceWith(ast);
      //   return;
      // }

      // let objectProperties = [];
      // let objectName = null;
      // let ast = null;

      // path.get("specifiers").forEach((specifier) => {
      //   if (t.isImportDefaultSpecifier(specifier)) {
      //     /**
      //      * import b from 'b'
      //      */
      //     objectProperties.push(`default: ${specifier.node.local.name}`);
      //   } else if (t.isImportSpecifier(specifier)) {
      //     /**
      //      * import { a as ay, b } from 'a'
      //      */
      //     const imported = specifier.node.imported.name;
      //     const local = specifier.node.local.name;
      //     objectProperties.push(
      //       imported === local ? local : `${imported}:${local}`
      //     );
      //   } else if (t.isImportNamespaceSpecifier(specifier)) {
      //     objectName = specifier.node.local.name;
      //   } else {
      //     throw new Error("Import type not recognised");
      //   }
      // });

      // if (!objectProperties.length) {
      //   ast = template(`const ${objectName} = _exports(${filepath})`);
      // } else {
      //   ast = template(
      //     `const { ${objectProperties.join(",")} } = _exports(${filepath})`
      //   );
      // }

      // path.replaceWith(ast);
      // return;

      /*
      const variables = [];
      const objectProperties = [];

      path.get("specifiers").forEach((specifier) => {
        if (t.isImportSpecifier(specifier)) {
          const imported = specifier.node.imported.name;
          const local = specifier.node.local.name;
          objectProperties.push(
            t.objectProperty(
              t.identifier(imported),
              t.identifier(local),
              undefined,
              true
            )
          );
          variables.push(
            t.variableDeclarator(
              t.objectPattern(objectProperties),
              t.callExpression(t.identifier("_require"), [
                t.stringLiteral(filename),
              ])
            )
          );
        } else {
          const name = specifier.node.local.name;
          const init = t.isImportDefaultSpecifier(specifier)
            ? t.memberExpression(
                t.callExpression(t.identifier("_require"), [
                  t.stringLiteral(filename),
                ]),
                t.identifier("default")
              )
            : t.callExpression(t.identifier("_require"), [
                t.stringLiteral(filename),
              ]);
          variables.push(t.variableDeclarator(t.identifier(name), init));
        }
      });

      path.replaceWith(t.variableDeclaration("const", variables));
      */
    },
    ExportDefaultDeclaration(path) {
      if (path.has("declaration")) {
        const buildRequire = template(`
            _exports.default = %%statement%%
          `);
        const ast = buildRequire({
          statement: t.toExpression(path.node.declaration),
        });
        path.replaceWith(ast);
      } else {
        console.error("Unhandled default export declaration");
      }
    },
    ExportNamedDeclaration(path) {
      if (path.has("declaration")) {
        if (t.isFunctionDeclaration(path.node.declaration)) {
          const name = path.node.declaration.id.name;
          const functionNode = path.node.declaration;
          path.replaceWith(functionNode);
          path.insertAfter(
            t.assignmentExpression(
              "=",
              t.memberExpression(t.identifier("_exports"), t.identifier(name)),
              t.identifier(name)
            )
          );
        } else if (t.isVariableDeclaration(path.node.declaration)) {
          const objectProperties = [];
          const { declarations } = path.node.declaration;
          declarations.forEach((declarator) => {
            const key = declarator.id.name;
            const value = declarator.init;
            objectProperties.push(t.objectProperty(t.identifier(key), value));
          });
          const buildRequire = template(`
            _exports = Object.assign(_exports, %%object%%)
          `);

          const ast = buildRequire({
            object: t.objectExpression(objectProperties),
          });

          path.replaceWith(ast);
        } else {
          console.error("Unhandled named export declaration");
        }
      } else if (path.has("specifiers")) {
        // TODO: Re-exports and normal exports
        const isReExport = path.has("source");
        path.get("specifiers").forEach((specifier) => {
          const exportedName = specifier.get("exported").node.name;
          const localName =
            (specifier.has("local") && specifier.get("local").node.name) ||
            exportedName;
          if (t.isExportNamespaceSpecifier(specifier)) {
            // handles export * as b from "./b";
            if (isReExport) {
              const pathname = resolve.sync(path.get("source").node.value, {
                basedir: BASE_DIR,
              });
              const buildRequire = template(`
                _exports = Object.assign(_exports, {
                  %%exportedName%%: _require('${pathname}')
                })
              `);
              const ast = buildRequire({
                exportedName,
              });
              path.replaceWith(ast);
            }
          } else if (t.isExportSpecifier(specifier)) {
            // handles
            // export {d} from './d';
            // export {d as e} from './d';
            // export {
            //   hey
            // }
            if (isReExport) {
              const pathname = resolve.sync(path.get("source").node.value, {
                basedir: BASE_DIR,
              });
              const buildRequire = template(`
                _exports = Object.assign(_exports, {
                  %%exportedName%%: _require('${pathname}').%%localName%%
                })
              `);
              const ast = buildRequire({
                exportedName,
                localName,
              });
              path.replaceWith(ast);
            }
          } else {
            console.error("Unhandled ExportNamedDeclaration");
          }
        });
      }
    },
    ExportAllDeclaration(path) {
      const pathname = resolve.sync(path.get("source").node.value, {
        basedir: BASE_DIR,
      });
      const ast = template(`
        _exports = Object.assign(_exports, {
          ..._require('${pathname}')
        })
      `)();
      path.replaceWith(ast);
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

function getAbsolutePath(filename) {
  return resolve.sync(filename, {
    basedir: BASE_DIR,
  });
}

function handleImportDeclaration(path) {
  const filepath = getAbsolutePath(path.get("source").node.value);
  let objectProperties = [];
  let objectName = null;
  let ast = null;

  path.get("specifiers").forEach((specifier) => {
    if (t.isImportDefaultSpecifier(specifier)) {
      /**
       * import b from 'b'
       */
      objectProperties.push(`default: ${specifier.node.local.name}`);
    } else if (t.isImportSpecifier(specifier)) {
      /**
       * import { a as ay, b } from 'a'
       */
      const imported = specifier.node.imported.name;
      const local = specifier.node.local.name;
      objectProperties.push(
        imported === local ? local : `${imported}:${local}`
      );
    } else if (t.isImportNamespaceSpecifier(specifier)) {
      /**
       * import * as e from 'e'
       */
      objectName = specifier.node.local.name;
    } else {
      throw new Error("Import type not recognised");
    }
  });

  if (!path.get("specifiers").length) {
    /**
     * import './a'
     */
    ast = template(`
          _require('${getAbsolutePath(filepath)}')
        `)();
  } else if (!objectProperties.length) {
    ast = template(`const ${objectName} = _exports(${filepath})`);
  } else {
    ast = template(
      `const { ${objectProperties.join(",")} } = _exports(${filepath})`
    );
  }

  path.replaceWith(ast);
  return;
}

// BASE_DIR =
//   "/home/jiawei/Documents/rk-webpack-clone-master/assignments/02/fixtures/02/code";
// const singleEntrypoint =
//   "/home/jiawei/Documents/rk-webpack-clone-master/assignments/02/fixtures/02/code/main.js";

// bundle(singleEntrypoint, "/home/jiawei/Documents/module-bundler/output");

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
    0: (exportToPopulate, getModule, filepath) => {
      const a = getModule('a.js').default;
      // copied contents of entry file
      exportsToPopulate.default = a;
    },
    'a.js': (exportToPopulate, getModule) => {
      // copied contents of entryFile
    }
  };
  
  function getModule(filepath) {
      if (!exportsMap[filepath]) {
        exportsMap[filepath] = {};
        moduleMap[filepath](exportsMap[filepath], getModule);
      }
      return exportsMap[filepath];
    }

  return getModule(entryFile);
 })(0)
 */

module.exports = bundle;
