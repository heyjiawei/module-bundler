const path = require("path");
const fs = require("fs");
const resolve = require("resolve");
const { parse } = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const t = require("@babel/types");
const { ChunkGraph } = require("webpack");

let basedir;
let dependencyMap;
let fileId;
let chunkMap;
let chunkId;
let chunkGraph;

function buildDependencyGraph(entryPoint) {
  setUp(entryPoint);

  build(parseToAst(entryPoint), chunkId);

  return {
    dependencyMap,
    chunkMap,
    chunkGraph,
  };
}

function build(ast, currentChunk) {
  traverse(ast, {
    ImportDeclaration(path) {
      const sourceFilepath = getAbsoluteFilepath(path.get("source").node.value);
      addToDependencyMap(sourceFilepath);
      build(parseToAst(sourceFilepath), currentChunk);
    },
    CallExpression(path) {
      if (path.get("callee") && t.isImport(path.get("callee"))) {
        const filepath = getAbsoluteFilepath(
          path.get("arguments")[0].node.value
        );
        addToDependencyMap(filepath);
        addToChunkMap(currentChunk, filepath);

        const childrenChunkId = chunkMap.get(filepath);
        build(parseToAst(filepath), childrenChunkId);
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
  if (ChunkGraph.has(currentChunkId)) return;

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
  chunkId++;
}

// TODO: extract chunkNode to an Factory function

function parseToAst(filepath) {
  return parse(fs.readFileSync(getAbsoluteFilepath(filepath), "utf8"), {
    sourceType: "module",
  });
}

exports.buildDependencyGraph = buildDependencyGraph;
