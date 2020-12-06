const fs = require("fs");
const path = require("path");
const acorn = require("acorn");
const walk = require("acorn-walk");

const EXPORT_ALL_DECLARATION = "ExportAllDeclaration";
const EXPORT_NAMED_DECLARATION = "ExportNamedDeclaration";
const EXPORT_SPECIFIER = "ExportSpecifier";
const IMPORT_DECLARATION = "ImportDeclaration";
const IMPORT_NAMESPACE_SPECIFIER = "ImportNamespaceSpecifier";
const IMPORT_SPECIFIER = "ImportSpecifier";
const IMPORT_DEFAULT_SPECIFIER = "ImportDefaultSpecifier";

let DEPENDENCY_MAP = new Map();

// Chunking
let GLOBAL_CHUNK_ID = 1;
let CHUNK_MODULE_MAP = null;
let FILENAME_CHUNK_MAP = new Map();

function createModule(entryPoint, dependencyMap, chunkMap) {
  // Assume single entryPoint and entryPoint is a file
  // Read file content as string
  if (dependencyMap) {
    DEPENDENCY_MAP = dependencyMap;
  }

  if (chunkMap) {
    CHUNK_MODULE_MAP = chunkMap;
  }

  const { nextModuleAst, dependency } = createDependency(entryPoint, [], {
    isEntryFile: true,
    chunkId: 0,
  });

  const dependencyGraph = createGraph(nextModuleAst, dependency.module);
  console.log("Filename chunk map", Array.from(FILENAME_CHUNK_MAP.entries()));
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

function createGraph(ast, moduleNode, chunkId = 0) {
  if (ast == null) return moduleNode;
  ast.body.forEach((node) => {
    if (node.type === EXPORT_ALL_DECLARATION) {
      const {
        nextModuleAst,
        dependency,
      } = createDependency(
        getFilepathFromSourceASTNode(moduleNode, node),
        ["*"],
        { chunkId }
      );
      moduleNode.dependencies.push(dependency);
      createGraph(nextModuleAst, dependency.module, chunkId);
    } else if (node.type === EXPORT_NAMED_DECLARATION && node.source) {
      const {
        nextModuleAst,
        dependency,
      } = createDependency(
        getFilepathFromSourceASTNode(moduleNode, node),
        getExports(node.specifiers),
        { chunkId }
      );
      moduleNode.dependencies.push(dependency);
      createGraph(nextModuleAst, dependency.module, chunkId);
    } else if (node.type === IMPORT_DECLARATION) {
      const {
        nextModuleAst,
        dependency,
        isNotJSFile,
      } = createDependency(
        getFilepathFromSourceASTNode(moduleNode, node),
        getExports(node.specifiers),
        { chunkId }
      );
      if (!isNotJSFile) {
        moduleNode.dependencies.push(dependency);
      }

      if (nextModuleAst) {
        createGraph(nextModuleAst, dependency.module, chunkId);
      }
    } else {
      /*
      Handle all dynamic import statements
      */
      walk.simple(node, {
        ImportExpression(node) {
          walk.simple(node, {
            Literal(node) {
              /* This module will be in 1 (or multiple) chunk(s).
              When bundler transforms files, they now need to check if this is a separate chunk.
              
              If it is not in a separate chunk, it will be in the main chunk
              that will be sent down initially.

              If it should be in a separate chunk, it will be in a different 
              "import" file.

              How do we demarcate that this is to be in a separate chunk?
              chunk Id

              How do you get the chunkId from the file?
              filename to chunk Id map
              */
              const absoluteFilepath = getFilepath(
                moduleNode.filepath,
                node.value
              );
              if (
                FILENAME_CHUNK_MAP.has(absoluteFilepath) ||
                DEPENDENCY_MAP.get(absoluteFilepath) != null
              ) {
                // This module was either visited before (1)
                // or is used as a dependency by another module (2)
                /*
              How do we know if it's (1) or (2)
              If we have some sort of state to check which chunk we are in now.
                If the chunk only contains this module, then it is (1)
                If the chunk does not point to this module, then it is (2)
              */
              } else {
                const moduleChunkId = GLOBAL_CHUNK_ID++;
                CHUNK_MODULE_MAP.set(
                  moduleChunkId,
                  new Set([absoluteFilepath])
                );
                // Filename chunk map is set when the file is the parent node
                // of the new chunk
                FILENAME_CHUNK_MAP.set(absoluteFilepath, moduleChunkId);

                const { nextModuleAst, dependency } = createDependency(
                  absoluteFilepath,
                  [],
                  {
                    chunkId: moduleChunkId,
                  }
                );

                createGraph(nextModuleAst, dependency.module, moduleChunkId);
              }
            },
          });
        },
      });
    }
  });
  return moduleNode;
}

function getFilepath(parentFilepath, filename) {
  let filepath = "";
  if (path.isAbsolute(filename)) {
    filepath = filename;
  } else if (isFileOrDirectory(filename)) {
    filepath = getFilepathOfDirectoryOrFile(parentFilepath, filename);
  } else {
    filepath = getPathInNodeModule(parentFilepath, filename);
  }

  if (fs.existsSync(filepath)) {
    return filepath;
  } else {
    throw new Error(`Unable to resolve "${filename}" from "${parentFilepath}"`);
  }
}

function createDependency(
  filepath,
  exports,
  options = {
    isEntryFile: false,
  }
) {
  const { isEntryFile, chunkId } = options;
  // This handles synchronous imports in chunks
  if (chunkId) {
    const chunkFiles = CHUNK_MODULE_MAP.get(chunkId);
    chunkFiles.add(filepath);

    const content = fs.readFileSync(filepath, "utf8");
    const nextModuleAst = acorn.parse(content, {
      ecmaVersion: 12,
      sourceType: "module",
    });

    const module = {
      filepath,
      isEntryFile,
      dependencies: [],
    };
    const dependency = {
      module,
      exports,
    };

    return {
      nextModuleAst,
      dependency,
    };
  }
  // If filepath exist, it would return the same dependency reference
  const existingDependency = DEPENDENCY_MAP.get(filepath);
  if (existingDependency) {
    return {
      nextModuleAst: null,
      dependency: existingDependency,
    };
  } else if (isNotJSFile(filepath)) {
    return {
      nextModuleAst: null,
      dependency: null,
      isNotJSFile: true,
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

function isNotJSFile(filepath) {
  return filepath.endsWith(".png") || filepath.endsWith(".css");
}

// const singleEntrypoint = "";

// a dependency graph will be returned for every filepath
// const multipleEntrypoints = { index: "./test/index.js" };

// entrypoint could be a directory or a file
// for a directory, we need to find index.js
// console.log(JSON.stringify(createModule(singleEntrypoint), " ", 2));
exports.resolver = createModule;
exports.DEPENDENCY_MAP = DEPENDENCY_MAP;
