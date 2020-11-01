// in main.js
const a = require('a')

// in a.js
const b = require('b')

// b.js
const a = require('a') // returns exportsMap[a] = undefined

const c = require('c')

// c.js
const a = require('a') // returns exportsMap[a] = undefined
const b = require('b') // returns exportsMap[b] = undefined

exportsMap[c] = 'c'

setTimeout(() => {
  console.log(`c.js | a=${a} | b=${b}`);
  // `c.js | a=undefined | b=undefined`
});

/*
By stack trace, b.js console log would return first, followed by a.js console log

Regardless, is this console log due to the import sequence?

The console logs are according to the direction of traversal of imports.

Changing main.js console log variable sequence won't change this console.log sequence.

  Is this an issue?
  If we were to do console log tracing, we would trace by the variables and the order of the imports does not matter
*/ 

/*
What if we flip 
import { a } from './a' to
const a = exports['./a']

and replace variable with via require(a)?

- How do we map variable to filename?
  - In transforming import to exports['./a'], we are able to map variable used to filename

- Will we still be able to get the console logs according to the direction of traversal of imports?
  - No. It is logging in the direction of variables fetched
*/

// main.js
const a = exports('./a').a;
const b = exports('./b').b;
const c = exports('./c').c;

setTimeout(() => {
  console.log(`main.js | a=${require('a')} | b=${require('b')} | c=${require('c')}`);
});

// a.js
const b = exports('./b').b;
const c = exports('./c').c;

exports('a') = 'a';

setTimeout(() => {
  console.log(`a.js | b=${require('b')} | c=${require('c')}`);
});

// b.js
const a = exports('./a').a;
const c = exports('./c').c;

exports('b') = 'b'

setTimeout(() => {
  console.log(`b.js | a=${require('a')} | c=${require('c')}`);
});
// at this point of time, require('a') would return 'a'

// c.js
const a = exports('./a').a; // returns value 'a'
const b = exports('./b').b; // returns value 'b'

exports('c') = 'c'

setTimeout(() => {
  console.log(`c.js | a=${a} | b=${b}`);
});

/*
The issue is the import is called before the module's export is returned.

Can we shift all export statements up? No.
import { a } from 'a';
export { b: a }

import { a } from 'a';
const b = a + 1;
export { b }

Circular dependency is not an issue unless 1 of the module is re-exporting a circular dependency import
*/

/*
- Resolve with rollup style?
- Replace
import { a } from 'a' with 
const a = exports('./a');
require('./a');
*/

// main.js
const a = exports('./a');
require('./a');

// a.js
const b = exports('./b');
require('./b');

// b.js
const a = exports('./a');
require('./a'); // returns undefined
const c = exports('./c');
require('./c');

// c.js
const a = exports('./a');
require('./a'); // returns undefined
const b = exports('./b');
require('./b') // return undefined

exports('./c') = 'c'

setTimeout(() => {
  console.log(`c.js | a=${a} | b=${b}`);
  // `c.js | a=undefined | b=undefined`
});

/*
If we keep translating
import {a} from './a' to
require('./a')

  and let require('./a') return the file module while exports('./a') still returns undefined, circular dependencies will cause stack overflow

*/