
  ((entryFile) => {
    const moduleMap = {"/home/jiawei/Documents/rk-webpack-clone-master/assignments/02/fixtures/02/code/main.js": (_exports, _require) => { _require('/home/jiawei/Documents/rk-webpack-clone-master/assignments/02/fixtures/02/code/e.js').default(_require('/home/jiawei/Documents/rk-webpack-clone-master/assignments/02/fixtures/02/code/a.js')); },"/home/jiawei/Documents/rk-webpack-clone-master/assignments/02/fixtures/02/code/a.js": (_exports, _require) => { _exports = Object.assign(_exports, {
  b: _require('/home/jiawei/Documents/rk-webpack-clone-master/assignments/02/fixtures/02/code/b.js')
});
_exports = Object.assign(_exports, { ..._require('/home/jiawei/Documents/rk-webpack-clone-master/assignments/02/fixtures/02/code/c.js')
});
_exports = Object.assign(_exports, {
  d: _require('/home/jiawei/Documents/rk-webpack-clone-master/assignments/02/fixtures/02/code/d.js').d
}); },"/home/jiawei/Documents/rk-webpack-clone-master/assignments/02/fixtures/02/code/b.js": (_exports, _require) => { _exports = Object.assign(_exports, {
  a: 'b.js a'
});
_exports = Object.assign(_exports, {
  b: 'b.js b'
});
_exports.default = 'b.js default'; },"/home/jiawei/Documents/rk-webpack-clone-master/assignments/02/fixtures/02/code/c.js": (_exports, _require) => { _exports = Object.assign(_exports, {
  ca: 'c.js a'
});
_exports = Object.assign(_exports, {
  cb: 'c.js b'
});
_exports = Object.assign(_exports, {
  cc: 'c.js c'
}); },"/home/jiawei/Documents/rk-webpack-clone-master/assignments/02/fixtures/02/code/d.js": (_exports, _require) => { _exports = Object.assign(_exports, {
  d: 'd.js d'
}); },"/home/jiawei/Documents/rk-webpack-clone-master/assignments/02/fixtures/02/code/e.js": (_exports, _require) => { _exports.default = function log(data) {
  console.log(JSON.stringify(data));
}; },};
    const exportsMap = {};

    function getModule(filepath) {
      if (exportsMap[filepath] == null) {
        exportsMap[filepath] = {};
        moduleMap[filepath](exportsMap[filepath], getModule);
      }
      return exportsMap[filepath];
    }

    return getModule(entryFile);
  })("/home/jiawei/Documents/rk-webpack-clone-master/assignments/02/fixtures/02/code/main.js")
  