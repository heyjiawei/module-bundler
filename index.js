const fs = require("fs");
const path = require("path");
const espree = require("espree");

function createModule(entrypoint) {
  // Assume single entrypoint and entrypoint is a file
  // Read file content as string
  const content = fs.readFileSync(entrypoint, "utf8");
  const ast = espree.parse(content, { ecmaVersion: 12, sourceType: "module" });

  const root = {
    id: 1,
    filepath: path.join(process.cwd(), entrypoint),
    isEntryFile: true,
    dependencies: [],
  };
  console.log("root filepath", root.filepath);
  const dependencyGraph = createGraph(ast, root);
  return dependencyGraph;
}

function createGraph(ast, moduleNode) {
  const module = ast.body.forEach((node) => {
    if (node.type === "ImportDeclaration") {
      let filename = node.source.value;
      const isRelativeImport = !path.isAbsolute(filename);
      let filepath = null;

      if (isRelativeImport) {
        // Check if node module, file or directory
        // If node module
        // TODO:
        // If directory
        if (isDirectory(moduleNode.filepath, filename)) {
          filename = path.join(
            path.dirname(moduleNode.filepath),
            filename,
            "index.js"
          );
          filepath = filename;
        } else {
          // If file
          console.log("extension", path.extname(filename));
          filename =
            path.extname(filename).length === 0 ? `${filename}.js` : filename;
          filepath = path.join(path.dirname(moduleNode.filepath), filename);
        }
      } else {
        filepath = filename;
      }

      console.log("this module filepath", filepath);
      const module = {
        id: moduleNode.id + 1,
        filepath,
        isEntryFile: false,
        dependencies: [],
      };
      const dependency = {
        module,
        exports: [],
      };
      moduleNode.dependencies.push(dependency);

      // Intensionally throw when file doesn't exist
      const content = fs.readFileSync(filepath, "utf8");
      const nextModuleAst = espree.parse(content, {
        ecmaVersion: 12,
        sourceType: "module",
      });
      createGraph(nextModuleAst, module);
    }
  });
  return moduleNode;
}

function isDirectory(parentFilename, currentFilename) {
  if (path.extname(currentFilename).length !== 0) return false;

  try {
    if (
      fs.existsSync(
        path.join(path.dirname(parentFilename), currentFilename, "index.js")
      )
    ) {
      return true;
    }
  } catch (error) {
    return false;
  }
}

const singleEntrypoint = "./test/tiger.js";

// a dependency graph will be returned for every filepath
// const multipleEntrypoints = { index: "./test/index.js" };

// entrypoint could be a directory or a file
// for a directory, we need to find index.js

console.log(JSON.stringify(createModule(singleEntrypoint), " ", 2));
