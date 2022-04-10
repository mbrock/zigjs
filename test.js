import { parser } from "./dist/zig.js"
import { evalFile } from "./eval.js"
import { readFileSync } from "fs"

let exampleSource = readFileSync("std/linked_list.zig").toString()
let exampleFile = parser.configure({
  strict: true,
}).parse(exampleSource)

console.log(evalFile(exampleSource, exampleFile))
