import { parser } from "./zig.js"
import { readFileSync } from "fs"

let exampleSource = readFileSync("std/linked_list.zig").toString()
let exampleFile = parser.configure({
  strict: true,
}).parse(exampleSource)

console.log(evalFile(exampleSource, exampleFile))
