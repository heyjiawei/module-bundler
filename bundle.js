const moduleMap = {"/home/jiawei/Documents/rk-webpack-clone-master/assignments/02/fixtures/01/code/main.js": (_exports, _require) => { const a = _require('/home/jiawei/Documents/rk-webpack-clone-master/assignments/02/fixtures/01/code/a.js');
import { b } from 'b';
console.log(`a + b = ${ a + b }`); },"/home/jiawei/Documents/rk-webpack-clone-master/assignments/02/fixtures/01/code/a.js": (_exports, _require) => { import * as c from './c';
const data = c.default + c.foo1() + c.foo2;
export default data; },"/home/jiawei/Documents/rk-webpack-clone-master/assignments/02/fixtures/01/code/c.js": (_exports, _require) => { export function foo1() {
    return 8;
}
export const foo2 = 3;
const foo3 = 4;
const foo4 = 4;
export default foo3 + foo4; },"/home/jiawei/Documents/rk-webpack-clone-master/assignments/02/fixtures/01/code/node_modules/b/dist/main.js": (_exports, _require) => { export const b = 23; },}