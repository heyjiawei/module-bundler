const path = require("path");
const fs = require("fs");
const resolve = require("resolve");
const { parse } = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const generate = require("@babel/generator").default;
const t = require("@babel/types");
const template = require("@babel/template").default;

// LOADERS
const cssLoader = require("./loaders/cssLoader");
const fileLoader = require("./loaders/fileLoader");

const { resolver: buildDependencyGraph } = require("./resolver");
const rimraf = require("rimraf");

let BASE_DIR;
let OUTPUT_DIR;

function bundle(entryFile, outputFolder) {
  BASE_DIR = path.dirname(entryFile);
  OUTPUT_DIR = outputFolder;

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
    const cssMap = {};

    function getModule(filepath) {
      if (filepath.endsWith('.css')) {
        return cssLoader(filepath);
      } else if (exportsMap[filepath] == null) {
        exportsMap[filepath] = {};
        moduleMap[filepath](exportsMap[filepath], getModule);
      }
      return exportsMap[filepath];
    }

    function cssLoader(filepath) {
      const filename = filepath.split('/').pop();
      if (cssMap[filename]) return;

      const link = document.createElement('link');
      link.href = "./" + filename;
      link.rel = 'stylesheet';
      document.head.append(link);
      cssMap[filename] = true;
    }

    return getModule(entryFile);
  })("${entryFilename}")
  `
  );
  return {
    folder: outputFolder,
    main: outputFilepath,
  };
}

let scopePerModule = null;
function transform(filepath) {
  const code = fs.readFileSync(filepath, "utf8");
  const ast = parse(code, {
    sourceType: "module",
    sourceFilename: filepath,
  });
  scopePerModule = {};

  traverse(ast, {
    ImportDeclaration(path) {
      handleImportDeclaration(path);
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
          handleExportFunctionDeclaration(path);
        } else if (t.isVariableDeclaration(path.node.declaration)) {
          handleExportVariableDeclaration(path);
        } else {
          console.error("Unhandled named export declaration");
        }
      } else if (path.has("specifiers")) {
        // Re-exports and normal exports
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
            } else {
              // export {
              //   hey
              // }
              const ast = getExportAST(exportedName, localName);
              path.insertAfter(ast);
            }
          } else {
            console.error("Unhandled ExportNamedDeclaration");
          }
        });

        if (!isReExport) {
          path.remove();
        }
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
    FunctionDeclaration(path) {
      // TODO: Replace all expressions that match localName with scopePerModule[expressionName].codeString
      path.traverse({
        Identifier(path) {
          console.log("Identifier in FunctionDeclaration");
        },
      });
    },
    ExpressionStatement(path) {
      path.traverse({
        Identifier(path) {
          if (isTransformedNode(path)) return;
          if (isModuleScope(path, path.node.name)) {
            transformNode(path, path.node.name);
          }
        },
      });
    },
    VariableDeclaration(path) {
      path.traverse({
        Identifier(path) {
          const parentNode = path.parent;
          if (
            t.isBinaryExpression(parentNode) ||
            t.isMemberExpression(parentNode)
          ) {
            transformNode(path, path.node.name);
          } else {
            console.log("Identifier in VariableDeclaration");
          }
        },
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

function getAbsolutePath(filename) {
  return resolve.sync(filename, {
    basedir: BASE_DIR,
  });
}

function handleImportDeclaration(path) {
  let filepath = getAbsolutePath(path.get("source").node.value);

  path.get("specifiers").forEach((specifier) => {
    /**
     * Handle file imports. We can extend it to .svg | .jpeg etc.
     * import url from './image.png';
     */
    if (
      t.isImportDefaultSpecifier(specifier) &&
      filepath.endsWith(".png") &&
      typeof fileLoader === "function"
    ) {
      const localName = specifier.node.local.name;
      if (!scopePerModule[localName]) {
        const updatedFilename = fileLoader(filepath, OUTPUT_DIR);
        scopePerModule[localName] = {
          codeString: `"./${updatedFilename}"`,
        };
      }
    } else if (t.isImportDefaultSpecifier(specifier)) {
      /**
       * import b from 'b'
       */
      const localName = specifier.node.local.name;
      if (!scopePerModule[localName]) {
        scopePerModule[localName] = {
          codeString: `_require('${getAbsolutePath(filepath)}').default`,
        };
      } else {
        throw new Error(`Identifier ${localName} has already been declared!`);
      }
    } else if (t.isImportSpecifier(specifier)) {
      /**
       * import { a as ay, b } from 'a'
       */
      const importedName = specifier.node.imported.name;
      const localName = specifier.node.local.name || importedName;

      if (!scopePerModule[localName]) {
        scopePerModule[localName] = {
          codeString: `_require('${getAbsolutePath(
            filepath
          )}').${importedName}`,
        };
      } else {
        throw new Error(`Identifier ${localName} has already been declared!`);
      }
    } else if (t.isImportNamespaceSpecifier(specifier)) {
      /**
       * import * as e from 'e'
       */
      const localName = specifier.node.local.name;
      if (!scopePerModule[localName]) {
        scopePerModule[localName] = {
          codeString: `_require('${getAbsolutePath(filepath)}')`,
        };
      } else {
        throw new Error(`Identifier ${localName} has already been declared!`);
      }
    } else {
      throw new Error("Import type not recognised");
    }
  });

  // Check file extension and handover to Loaders file
  // needs to be processed by loaders
  if (filepath.endsWith(".png") && typeof fileLoader === "function") {
    // fileLoader(filepath, OUTPUT_DIR);
    path.remove();
    return;
  } else if (filepath.endsWith(".css") && typeof cssLoader === "function") {
    filepath = cssLoader(filepath, OUTPUT_DIR);
  }

  ast = template(`
          _require('${getAbsolutePath(filepath)}')
        `)();
  path.replaceWith(ast);
  return;
}

/**
 * Handles
 * export function a() {}
 *
 * transforms it into
 * function a() {}
 * Object.defineProperties(_exports, {
 *  'a' : { get: function() { return a; }}
 * })
 */
function handleExportFunctionDeclaration(path) {
  const functionNode = path.node.declaration;
  const name = functionNode.id.name;
  path.replaceWith(functionNode);
  const ast = getExportAST(name);
  path.insertAfter(ast);
}

function getExportAST(exportName, localName) {
  if (!localName) {
    localName = exportName;
  }

  const ast = template(`
  Object.defineProperties(_exports, {
    '${exportName}': { 
      get: function() { 
        return ${localName}; 
      },
      enumerable: true
    }
  })
  `)();
  return ast;
}

/**
 * Handles
 * export const a = 1;
 *
 * transforms it into
 * 
  _exports = Object.defineProperties(_exports, { 
    get: function() {
      return a;
    }
  })
 * 
 * test cases: 
 * export const c = a;
export const e = 1;
export const f = () => {}
export const h = function() {}, we = () => {};
export const i = function letsgo() {}
 */
function handleExportVariableDeclaration(path) {
  const exportVariables = [];
  const { declarations } = path.node.declaration;
  declarations.forEach((declarator) => {
    const variableName = declarator.id.name;

    const buildRequire = template(`
      Object.defineProperties(_exports, {
        '${variableName}': {
          get: function() {
            return %%value%%;
          },
          enumerable: true
        }
      })
    `);

    const ast = buildRequire({
      value: declarator.id,
    });
    exportVariables.push(ast);
  });

  path.replaceWith(path.node.declaration);
  exportVariables.forEach((ast) => {
    path.insertAfter(ast);
  });
}

function transformNode(path, identifierName) {
  if (!scopePerModule[identifierName]) return;

  const ast = template(scopePerModule[identifierName].codeString)();
  path.replaceWith(ast);
  path.skip();
}

function isTransformedNode(path) {
  const parent = path.parent;
  return (
    parent.type === "MemberExpression" &&
    parent.object.callee &&
    parent.object.callee.name === "_require"
  );
}

function isModuleScope(path, name) {
  if (path.scope.block.type === "Program") {
    return true;
  } else if (path.scope.bindings[name]) {
    return false;
  } else {
    return isModuleScope(path.scope.path.parentPath, name);
  }
}

// BASE_DIR =
//   "/Users/jiawei.chong/Documents/rk-webpack-clone/assignments/04/fixtures/02/code";
// const singleEntrypoint =
//   "/Users/jiawei.chong/Documents/rk-webpack-clone/assignments/04/fixtures/02/code/main.js";

// try {
//   rimraf.sync("/Users/jiawei.chong/Documents/module-bundler/output");
// } catch (error) {
//   console.error(`Error while deleting ${error}.`);
// }
// bundle(singleEntrypoint, "/Users/jiawei.chong/Documents/module-bundler/output");

// console.log(JSON.stringify(buildDependencyGraph(singleEntrypoint), " ", 2));

module.exports = bundle;
