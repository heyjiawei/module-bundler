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
      // filepath: path.join(process.cwd(), entrypoint),
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
    if (node.type === "ExportDefaultDeclaration") {
      if (node.declaration.type === "Literal") {
        // If exported default is a literal
        exportName.push(node.declaration.value);
      } else if (node.declaration.type === "Identifier") {
        //If exported default is an identifier
        exportName.push(node.declaration.name);
      }
    } else if (node.type === "ExportNamedDeclaration") {
      // TODO:
    } else if (node.type === "ImportDeclaration") {
      let filename = node.source.value;
      // const isRelativeImport = !path.isAbsolute(filename);
      let filepath = null;

      if (path.isAbsolute(filename)) {
        filepath = filename;
      } else {
        // Check if node module, file or directory
        if (isFileOrDirectory(filename)) {
          ({ filename, filepath } = getDirectoryOrFilepaths(
            moduleNode.filepath,
            filename
          ));
        } else if (isNodeModule(filename)) {
          // If node_module
        } else {
          throw "File not found!";
        }
      }

      const module = {
        filepath,
        isEntryFile: false,
        dependencies: [],
      };
      const dependency = {
        module,
        exports: [],
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

function isNodeModule(filename) {
  // recursively find node_modules folder name
}

function isFileOrDirectory(filename) {
  return new RegExp(/^(\.{2}\/|\.)/).test(filename);
}

function getDirectoryOrFilepaths(parentFilename, currentFilename) {
  if (path.extname(currentFilename).length !== 0) {
    // If file with file extension
    return {
      filename: currentFilename,
      filepath: path.join(path.dirname(parentFilename), currentFilename),
    };
  } else if (
    fs.existsSync(
      path.join(path.dirname(parentFilename), currentFilename, "index.js")
    )
  ) {
    // If folder contains an index.js, it's a directory
    const filename = path.join(
      path.dirname(parentFilename),
      currentFilename,
      "index.js"
    );
    return {
      filename,
      filepath: filename,
    };
  } else {
    const containsPkgManifestJson = fs.existsSync(
      path.join(path.dirname(parentFilename), currentFilename, "package.json")
    );

    if (containsPkgManifestJson) {
      // If folder contains a package.json and
      // has a file as declared in package.json main, it's a directory
      const pkgManifestFilepath = path.join(
        path.dirname(parentFilename),
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
            path.dirname(parentFilename),
            currentFilename,
            packageFilepath
          )
        )
      ) {
        const filename = path.join(
          path.dirname(parentFilename),
          currentFilename,
          packageFilepath
        );
        return {
          filename,
          filepath: filename,
        };
      }
    }

    // Otherwise, it's a file with no file extensions
    return {
      filename: `${currentFilename}.js`,
      filepath: path.join(
        path.dirname(parentFilename),
        `${currentFilename}.js`
      ),
    };
  }
}

const singleEntrypoint = "";

// a dependency graph will be returned for every filepath
// const multipleEntrypoints = { index: "./test/index.js" };

// entrypoint could be a directory or a file
// for a directory, we need to find index.js
console.log(JSON.stringify(createModule(singleEntrypoint), " ", 2));
module.exports = createModule;
