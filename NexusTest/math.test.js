import test from "node:test"; import assert from "node:assert/strict"; import { add } from "./math.js"; test("2 + 3 = 5",()=>assert.equal(add(2,3),5));
