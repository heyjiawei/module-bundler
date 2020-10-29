const path = require("path");
const fs = require("fs");
const resolve = require("resolve");
const { parse } = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const t = require("@babel/types");
const { Dependency } = require("webpack");

let basedir;
let dependencyMap;
let fileId;
let chunkMap;
let chunkId;

function buildDependencyGraph(entryPoint) {
  basedir = path.dirname(entryPoint);
  dependencyMap = new Map();
  chunkMap = new Map();
  fileId = 0;
  chunkId = 0;

  addToMap(getAbsoluteFilepath(entryPoint), chunkId);

  const ast = parse(fs.readFileSync(entryPoint, "utf8"), {
    sourceType: "module",
  });
  build(ast, chunkId);

  return {
    dependencyMap,
    chunkMap,
  };
}

function build(ast, currentChunk) {
  traverse(ast, {
    ImportDeclaration(path) {
      const sourceFilepath = getAbsoluteFilepath(path.get("source").node.value);
      addToMap(sourceFilepath);
    },
    CallExpression(path) {
      if (path.get("callee") && t.isImport(path.get("callee"))) {
        const filepath = path.get("arguments")[0].node.value;
        addToDependencyMap(filepath);
        addToChunkMap(currentChunk, getAbsoluteFilepath(filepath));
      }
    },
  });
}

function getAbsoluteFilepath(filepath) {
  return resolve.sync(filepath, {
    basedir,
  });
}

function addToDependencyMap(filepath) {
  const hasEncountedFile = dependencyMap.get(filepath);
  if (hasEncountedFile) return;
  dependencyMap.set(filepath, fileId++);
}

function addToChunkMap(parentChunk) {}

exports.buildDependencyGraph = buildDependencyGraph;
