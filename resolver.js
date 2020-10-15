const fs = require("fs");
const path = require("path");
const acorn = require("acorn");

const EXPORT_ALL_DECLARATION = "ExportAllDeclaration";
const EXPORT_NAMED_DECLARATION = "ExportNamedDeclaration";
const EXPORT_SPECIFIER = "ExportSpecifier";
const IMPORT_DECLARATION = "ImportDeclaration";
const IMPORT_NAMESPACE_SPECIFIER = "ImportNamespaceSpecifier";
const IMPORT_SPECIFIER = "ImportSpecifier";
const IMPORT_DEFAULT_SPECIFIER = "ImportDefaultSpecifier";

const DEPENDENCY_MAP = new Map();

function createModule(entryPoint) {
  // Assume single entryPoint and entryPoint is a file
  // Read file content as string
  const { nextModuleAst, dependency } = createDependency(entryPoint, [], true);

  const dependencyGraph = createGraph(nextModuleAst, dependency.module);
  return dependencyGraph;
}

function getExports(specifiers) {
  let exports = [];
  specifiers.forEach((specifier) => {
    if (specifier.type === EXPORT_SPECIFIER) {
      exports.push(specifier.local.name);
    } else if (specifier.type === IMPORT_NAMESPACE_SPECIFIER) {
      // handles import * as e from './e';
      exports.push("*");
    } else if (specifier.type === IMPORT_SPECIFIER) {
      // Use imported identifier. That means
      // import { b as c } from './e';
      // will export [b]
      exports.push(specifier.imported.name);
    } else if (specifier.type === IMPORT_DEFAULT_SPECIFIER) {
      // Handles import a from './a';
      // Use imported identifier. That means 'default'
      exports.push("default");
    }
  });
  return exports;
}

function createGraph(ast, moduleNode) {
  ast.body.forEach((node) => {
    if (node.type === EXPORT_ALL_DECLARATION) {
      const {
        nextModuleAst,
        dependency,
      } = createDependency(getFilepathFromSourceASTNode(moduleNode, node), [
        "*",
      ]);
      moduleNode.dependencies.push(dependency);
      createGraph(nextModuleAst, dependency.module);
    } else if (node.type === EXPORT_NAMED_DECLARATION && node.source) {
      const { nextModuleAst, dependency } = createDependency(
        getFilepathFromSourceASTNode(moduleNode, node),
        getExports(node.specifiers)
      );
      moduleNode.dependencies.push(dependency);
      createGraph(nextModuleAst, dependency.module);
    } else if (node.type === IMPORT_DECLARATION) {
      const { nextModuleAst, dependency } = createDependency(
        getFilepathFromSourceASTNode(moduleNode, node),
        getExports(node.specifiers)
      );
      moduleNode.dependencies.push(dependency);

      if (nextModuleAst) {
        createGraph(nextModuleAst, dependency.module);
      }
    }
  });
  return moduleNode;
}

function createDependency(filepath, exports, isEntryFile = false) {
  // If filepath exist, it would return the same dependency reference
  const existingDependency = DEPENDENCY_MAP.get(filepath);
  if (existingDependency) {
    return {
      nextModuleAst: null,
      dependency: existingDependency,
    };
  } else {
    // Otherwise, create dependency
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

    const content = fs.readFileSync(filepath, "utf8");
    const nextModuleAst = acorn.parse(content, {
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
        const filepath = path.join(
          nodeModuleDir,
          packageName,
          pkgManifestJson.main
        );
        if (fs.existsSync(filepath)) {
          return filepath;
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
    const pkgManifestFilepath = path.join(
      path.dirname(parentFilepath),
      currentFilename,
      "package.json"
    );

    if (fs.existsSync(pkgManifestFilepath)) {
      // If folder contains a package.json and
      // has a file as declared in package.json main, it's a directory
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
  let filepath = "";
  if (path.isAbsolute(filename)) {
    filepath = filename;
  } else if (isFileOrDirectory(filename)) {
    // Check if file or directory
    filepath = getFilepathOfDirectoryOrFile(
      parentModuleNode.filepath,
      filename
    );
  } else {
    // Else is node module
    // Recursively search in node_module
    filepath = getPathInNodeModule(parentModuleNode.filepath, filename);
  }

  if (fs.existsSync(filepath)) {
    return filepath;
  } else {
    throw new Error(
      `Unable to resolve "${node.source.value}" from "${parentModuleNode.filepath}"`
    );
  }
}

// const singleEntrypoint = "";

// a dependency graph will be returned for every filepath
// const multipleEntrypoints = { index: "./test/index.js" };

// entrypoint could be a directory or a file
// for a directory, we need to find index.js
// console.log(JSON.stringify(createModule(singleEntrypoint), " ", 2));
exports.resolver = createModule;
exports.DEPENDENCY_MAP = DEPENDENCY_MAP;
