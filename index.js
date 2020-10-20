const fs = require("fs");
const resolve = require("resolve");
const { parse } = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const generate = require("@babel/generator").default;
const t = require("@babel/types");
const template = require("@babel/template").default;

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
    },
    ExportDefaultDeclaration(path) {
      // TODO:
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
          // const objectExpression = ;
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
        // TODO: Re-exports
      }
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
