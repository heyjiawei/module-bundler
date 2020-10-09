const fs = require("fs");
const path = require("path");
const espree = require("espree");

function createModule(entrypoint) {
  // Assume single entrypoint and entrypoint is a file
  // Read file content as string
  const content = fs.readFileSync(entrypoint, "utf8");
  const ast = espree.parse(content, { ecmaVersion: 12, sourceType: "module" });

  const root = {
    module: {
      filepath: entrypoint,
      isEntryFile: true,
      dependencies: [],
    },
    exports: [],
  };

  const dependencyGraph = createGraph(ast, root.module, root.exports);
  return dependencyGraph;
}

function createGraph(ast, moduleNode, exportName) {
  ast.body.forEach((node) => {
    // if (node.type === "ExportDefaultDeclaration") {
    //   // if (node.declaration.type === "Literal") {
    //   //   // If exported default is a literal
    //   //   exportName.push(node.declaration.value);
    //   // } else if (node.declaration.type === "Identifier") {
    //   //   //If exported default is an identifier
    //   //   exportName.push(node.declaration.name);
    //   // }
    //   // exportName.push("default");
    // } else if (node.type === "ExportNamedDeclaration") {
    //   if (node.declaration?.type === "VariableDeclaration") {
    //     // If exported is a variable
    //     node.declaration.declarations.forEach((declaration) => {
    //       if (declaration.type === "VariableDeclarator") {
    //         exportName.push(declaration.id.name);
    //       }
    //     });
    //   } else if (node.specifiers.length > 0) {
    //     // If exported is an ExportSpecifier
    //     node.specifiers.forEach((specifier) => {
    //       if (specifier.type === "ExportSpecifier") {
    //         exportName.push(specifier.exported.name);
    //       }
    //     });
    //     // TODO: Link module to import path
    //     const filepath = getFilepathFromSourceASTNode(moduleNode, node);

    //     const module = {
    //       filepath,
    //       isEntryFile: false,
    //       dependencies: [],
    //     };
    //     const dependency = {
    //       module,
    //       exports: [],
    //     };
    //     moduleNode.dependencies.push(dependency);

    //     console.log({ filepath });
    //     // Intensionally throw when file doesn't exist
    //     const content = fs.readFileSync(filepath, "utf8");
    //     const nextModuleAst = espree.parse(content, {
    //       ecmaVersion: 12,
    //       sourceType: "module",
    //     });
    //     createGraph(nextModuleAst, dependency.module, dependency.exports);
    //   }
    // } else if (node.type === "ExportAllDeclaration") {
    //   // Handle export * as g from './g';
    //   exportName.push(node.exported.name);

    //   // TODO: Link module to import path
    //   const filepath = getFilepathFromSourceASTNode(moduleNode, node);

    //   const module = {
    //     filepath,
    //     isEntryFile: false,
    //     dependencies: [],
    //   };
    //   const dependency = {
    //     module,
    //     exports: [],
    //   };
    //   moduleNode.dependencies.push(dependency);

    //   console.log({ filepath });
    //   // Intensionally throw when file doesn't exist
    //   const content = fs.readFileSync(filepath, "utf8");
    //   const nextModuleAst = espree.parse(content, {
    //     ecmaVersion: 12,
    //     sourceType: "module",
    //   });
    //   createGraph(nextModuleAst, dependency.module, dependency.exports);
    // } else

    if (node.type === "ImportDeclaration") {
      const filepath = getFilepathFromSourceASTNode(moduleNode, node);
      let exports = [];
      node.specifiers.forEach((specifier) => {
        if (specifier.type === "ImportNamespaceSpecifier") {
          // handles import * as e from './e';
          exports.push("*");
        } else if (specifier.type === "ImportSpecifier") {
          // Use imported identifier. That means
          // import { b as c } from './e';
          // will export [b]
          exports.push(specifier.imported.name);
        } else if (specifier.type === "ImportDefaultSpecifier") {
          // Handles import a from './a';
          // Use imported identifier. That means 'default'
          exports.push("default");
        }
      });

      const module = {
        filepath,
        isEntryFile: false,
        dependencies: [],
      };
      const dependency = {
        module,
        exports,
      };

      moduleNode.dependencies.push(dependency);

      console.log({ filepath });

      // Intensionally throw when file doesn't exist
      const content = fs.readFileSync(filepath, "utf8");
      const nextModuleAst = espree.parse(content, {
        ecmaVersion: 12,
        sourceType: "module",
      });
      createGraph(nextModuleAst, dependency.module, dependency.exports);
    }
  });
  return moduleNode;
}

function getPathInNodeModule(parentFilepath, packageName) {
  const parts = parentFilepath.split(path.sep);
  const folderCount = parts.length - 1;
  while (folderCount >= 0) {
    parts.pop();
    const nodeModuleDir = path.join(parts.join(path.sep), "node_modules");
    if (fs.existsSync(nodeModuleDir)) {
      // Find if packageName exist in nodeModuleDir
      const pkgManifestFilepath = path.join(
        nodeModuleDir,
        packageName,
        "package.json"
      );
      if (fs.existsSync(pkgManifestFilepath)) {
        const pkgManifestJson = JSON.parse(
          fs.readFileSync(pkgManifestFilepath, "utf8")
        );
        const packageFilepath = pkgManifestJson.main;
        if (
          fs.existsSync(path.join(nodeModuleDir, packageName, packageFilepath))
        ) {
          return path.join(nodeModuleDir, packageName, packageFilepath);
        }
      }
      // If node modules does not contain package, return nothing
      // if it contains package and file matches, return filepath
      // and break loop
    }
  }
  return "";
}

function isFileOrDirectory(filename) {
  return new RegExp(/^(\.{2}\/|\.)/).test(filename);
}

function getFilepathOfDirectoryOrFile(parentFilepath, currentFilename) {
  if (path.extname(currentFilename).length !== 0) {
    // If file with file extension
    return path.join(path.dirname(parentFilepath), currentFilename);
  } else if (
    fs.existsSync(
      path.join(path.dirname(parentFilepath), currentFilename, "index.js")
    )
  ) {
    // If folder contains an index.js, it's a directory
    return path.join(path.dirname(parentFilepath), currentFilename, "index.js");
  } else {
    const containsPkgManifestJson = fs.existsSync(
      path.join(path.dirname(parentFilepath), currentFilename, "package.json")
    );

    if (containsPkgManifestJson) {
      // If folder contains a package.json and
      // has a file as declared in package.json main, it's a directory
      const pkgManifestFilepath = path.join(
        path.dirname(parentFilepath),
        currentFilename,
        "package.json"
      );
      // We want to intensionally throw if there is an error parsing package.json
      const pkgManifestJson = JSON.parse(
        fs.readFileSync(pkgManifestFilepath, "utf8")
      );
      const packageFilepath = pkgManifestJson.main;
      if (
        fs.existsSync(
          path.join(
            path.dirname(parentFilepath),
            currentFilename,
            packageFilepath
          )
        )
      ) {
        return path.join(
          path.dirname(parentFilepath),
          currentFilename,
          packageFilepath
        );
      }
    }

    // Otherwise, it's a file with no file extensions
    return path.join(path.dirname(parentFilepath), `${currentFilename}.js`);
  }
}

function getFilepathFromSourceASTNode(parentModuleNode, node) {
  let filename = node.source.value;

  if (path.isAbsolute(filename)) {
    return filename;
  } else {
    // Check if node module, file or directory
    if (isFileOrDirectory(filename)) {
      return getFilepathOfDirectoryOrFile(parentModuleNode.filepath, filename);
    } else {
      // Recursively search in node_module
      const filepath = getPathInNodeModule(parentModuleNode.filepath, filename);

      if (filepath.length === 0) {
        // Otherwise file doesn't exist
        throw "File not found!";
      }
    }
  }
}

const singleEntrypoint =
  "/home/jiawei/Documents/rk-webpack-clone/assignments/01/fixtures/03/code/main.js";

// a dependency graph will be returned for every filepath
// const multipleEntrypoints = { index: "./test/index.js" };

// entrypoint could be a directory or a file
// for a directory, we need to find index.js
console.log(JSON.stringify(createModule(singleEntrypoint), " ", 2));
module.exports = createModule;
