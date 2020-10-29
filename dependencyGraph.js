const path = require("path");
const fs = require("fs");
const resolve = require("resolve");
const { parse } = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const t = require("@babel/types");

let basedir;
let dependencyMap;
let fileId;
let chunkMap;
let chunkId;
let chunkGraph;

function buildDependencyGraph(entryPoint) {
  setUp(entryPoint);

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
      addToDependencyMap(sourceFilepath);
      // Do we need to add this to the chunk graph?
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
  if (dependencyMap.has(filepath)) return;
  dependencyMap.set(filepath, fileId++);
}

function addToChunkMap(parentChunkId, filepath) {
  if (!chunkMap.has(filepath)) {
    chunkMap.set(filepath, chunkId++);
  }

  const currentChunkId = chunkMap.get(filepath);
  if (!chunkGraph.has(currentChunkId)) {
    const node = {
      parentChunkId,
      childrenChunkId: new Set(),
    };
    chunkGraph.set(currentChunkId, node);

    let parentNode = chunkGraph.get(parentChunkId);
    while (parentNode && !parentNode.childrenChunkId.has(currentChunkId)) {
      parentNode.childrenChunkId.add(currentChunkId);
      parentNode = chunkGraph.get(parentNode.parentChunkId);
    }
  }
}

function setUp(entryPoint) {
  basedir = path.dirname(entryPoint);
  dependencyMap = new Map();
  chunkMap = new Map();
  chunkGraph = new Map();
  fileId = 0;
  chunkId = 0;

  const entryFilepath = getAbsoluteFilepath(entryPoint);
  addToDependencyMap(entryFilepath);
  chunkMap.set(entryFilepath, chunkId);
  chunkGraph.set(chunkId, {
    parentChunkId: null,
    childrenChunkId: new Set(),
  });
  chunk++;
}

// TODO: extract chunkNode to an Factory function
//

exports.buildDependencyGraph = buildDependencyGraph;
