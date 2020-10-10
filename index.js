const fs = require("fs");
const path = require("path");
const espree = require("espree");

function createModule(entryPoint) {
  // Assume single entryPoint and entryPoint is a file
  // Read file content as string
  const { nextModuleAst: ast, dependency } = createDependency(
    entryPoint,
    [],
    true
  );

  const dependencyGraph = createGraph(
    ast,
    dependency.module,
    dependency.exports
  );
  return dependencyGraph;
}

function createGraph(ast, moduleNode, exportName) {
  ast.body.forEach((node) => {
    if (node.type === "ExportAllDeclaration") {
      const filepath = getFilepathFromSourceASTNode(moduleNode, node);
      let exports = ["*"];

      const { nextModuleAst, dependency } = createDependency(filepath, exports);
      moduleNode.dependencies.push(dependency);
      createGraph(nextModuleAst, dependency.module, dependency.exports);
    } else if (node.type === "ExportNamedDeclaration" && node.source) {
      const filepath = getFilepathFromSourceASTNode(moduleNode, node);
      let exports = [];
      node.specifiers.forEach((specifier) => {
        if (specifier.type === "ExportSpecifier") {
          exports.push(specifier.local.name);
        }
      });

      const { nextModuleAst, dependency } = createDependency(filepath, exports);
      moduleNode.dependencies.push(dependency);
      createGraph(nextModuleAst, dependency.module, dependency.exports);
    } else if (node.type === "ImportDeclaration") {
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

      const { nextModuleAst, dependency } = createDependency(filepath, exports);
      moduleNode.dependencies.push(dependency);

      if (nextModuleAst) {
        createGraph(nextModuleAst, dependency.module, dependency.exports);
      }
    }
  });
  return moduleNode;
}

const DEPENDENCY_MAP = new Map();

function createDependency(filepath, exports, isEntryFile = false) {
  // If filepath exist, it would return the same dependency reference
  const existingDependency = DEPENDENCY_MAP.get(filepath);
  if (existingDependency) {
    return {
      nextModuleAst: null,
      dependency: existingDependency,
    };
  } else {
    const module = {
      filepath,
      isEntryFile,
      dependencies: [],
    };
    const dependency = {
      module,
      exports,
    };

    DEPENDENCY_MAP.set(filepath, dependency);

    console.log({ filepath });

    // Intensionally throw when file doesn't exist
    const content = fs.readFileSync(filepath, "utf8");
    const nextModuleAst = espree.parse(content, {
      ecmaVersion: 12,
      sourceType: "module",
    });

    return {
      nextModuleAst,
      dependency,
    };
  }
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

  if (!path.isAbsolute(filename)) {
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

      return filepath;
    }
  }

  return filename;
}

const singleEntrypoint =
  "/home/jiawei/Documents/rk-webpack-clone/assignments/01/fixtures/04/code/main.js";

// a dependency graph will be returned for every filepath
// const multipleEntrypoints = { index: "./test/index.js" };

// entrypoint could be a directory or a file
// for a directory, we need to find index.js
console.log(JSON.stringify(createModule(singleEntrypoint), " ", 2));
module.exports = createModule;
