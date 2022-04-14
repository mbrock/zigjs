//
// zigeval: a simple Zig interpreter
//
// SPDX-License-Identifier: MIT
//
// Copyright 2022, Mikael Brockman <mikael@brockman.se>
//

class ZigError extends Error {
  constructor(msg: string, public data: any) { super(msg) }
}

export class ZigBug extends Error {
  constructor(...msg: string[]) { super(msg.join(" ")) }
}

export function bug(...x: any[]): Error {
  console.error(...x)
  debugger
  return new ZigBug(...x.map(x => x.toString()))
}

function error(x: string, data: any): Error {
  console.error("𝍐", x)
  return new ZigError(x, data)
}

abstract class Suspension {
}

class ReturnSuspension extends Suspension {
  constructor (public value: Value) {
    super()
  }
}

export enum Mutability {
  Constant = "Constant",
  Variable = "Variable",
}

export class Lazy<T, Meta = null> {
  content: T | undefined

  constructor(
    public mutability: Mutability,
    private thunk: () => T,
    public meta: Meta,
  ) {}

  read() {
    if (this.content === undefined) {
      this.content = this.thunk()
    }

    return this.content
  }

  write(x: T) {
    if (this.mutability === Mutability.Constant) {
      throw error("change constant", this)
    } else {
      this.content = x
    }
  }
}

export function lazy<T, Meta = null>(
  thunk: () => T,
  mutability: Mutability = Mutability.Constant,
  meta: Meta = null,
): Lazy<T, Meta> {
  return new Lazy(mutability, thunk, meta)
}

type Computer<T> = Generator<Suspension, T>

export class Cell<T, Meta = null> {
  content: T | undefined
  state: "have" | "need" | "busy" = "need"

  constructor(
    public mutability: Mutability,
    private thunk: () => Computer<T>,
    public meta: Meta,
  ) {}

  static make<T, Meta = null>(
    value: T, mutability: Mutability, meta?: Meta
  ): Cell<T, Meta> {
    let thunk = function* () { return value }
    let cell = new Cell(mutability, thunk, meta)
    cell.read()
    return cell
  }

  *read() {
    switch (this.state) {
      case "have": return this.content
      case "busy": throw error("circular dependency", this)
      case "need": {
        this.state = "busy"
        this.content = yield* this.thunk()
        this.state = "have"
        return this.content
      }
    }
  }

  write(x: T) {
    if (this.mutability === Mutability.Constant) {
      throw error("change constant", this)
    } else {
      this.content = x
    }
  }
}

type Value =
  StringValue | IntValue | FunctionValue |
  TypeValue | InstanceValue

interface TypeValue {
  kind: "TypeValue"
  type: Type
}

interface IntValue {
  kind: "IntValue"
  int: number
}

interface StringValue {
  kind: "StringValue"
  string: string
}

interface FunctionValue {
  kind: "FunctionValue"
  decl: FnDecl
  container: Container
  stack: Frame
}

interface InstanceValue {
  kind: "InstanceValue"
  container: Container
  fields: Map<string, Value>
}

interface Binder<T> {
  parent: null | typeof this
  bindings: Map<string, T>
}

export class Frame implements Binder<Cell<Value>> {
  constructor(
    public bindings: Map<string, Cell<Value>> = new Map(),
    public parent: null | Frame = null,
  ) {}
}

function resolve<T>(
  binder: Binder<T>,
  name: string,
): T | undefined {
  if (binder.bindings.has(name)) {
    return binder.bindings.get(name)
  } else if (binder.parent !== null) {
    return resolve(binder.parent, name)
  } else {
    return undefined
  }
}

function isBindingVisible<T>(
  binder: Binder<T>,
  name: string,
): boolean {
  return resolve(binder, name) !== undefined
}

function bindWithoutShadowing<T>(
  binder: Binder<T>,
  name: string,
  value: T,
): void {
  if (isBindingVisible(binder, name)) {
    throw error("shadowing", { name, binder })
  } else {
    binder.bindings.set(name, value)
  }
}

export class Container {
  bindings = new Map<string, Cell<Value, Decl>>()

  constructor(
    public name: string,
    public decl: StructDecl,
    public stack: Frame,
    public parent: null | Container = null,
  ) {}

  *initialize() {
    for (const x of this.decl.decls.values()) {
      const { kind, name } = x
      let thunk: () => Computer<Value>

      if (kind == "VarDecl") {
        thunk = (function* () {
          return yield* evalExpr(
            this, this.stack, x.initExpr.read())
        }).bind(this)
      } else if (kind == "FnDecl") {
        thunk = (function* () {
          return {
            kind: "FunctionValue",
            decl: x,
            container: this,
            stack: this.stack,
          }
        }).bind(this)
      } else if (kind == "TestDecl") {
        thunk = () => { throw bug("implement tests") }
      } else if (kind == "FieldDecl") {
        thunk = () => { throw bug("implement fields") }
      } else {
        throw bug(kind)
      }

      bindWithoutShadowing(
        this, name, new Cell(Mutability.Constant, thunk, x))
    }
  }

  runTests(
    predicate: (name: string) => boolean
  ): void {
    console.groupCollapsed("⚙", "Bindings for", this.name)
    console.log(this.bindings)
    console.groupEnd()

    for (const cell of this.bindings.values()) {
      console.log(cell)
      const { kind, name } = cell.meta
      if (kind == "TestDecl") {
        if (predicate.call(null, name)) {
          let value = this.runTest(name, cell.meta)
          let result = value.next()
          if (result.done) {
            continue
          } else {
            debugger
          }
        } else {
          console.info("skipping", name)
        }
      }
    }
  }

  *runTest(name: string, decl: TestDecl): Computer<void> {
    try {
      console.group("🤓", "Test:", name)
      let body = decl.body.read()
      for (let stmt of body) {
        yield* runStmt(this, this.stack, stmt)
      }
    } finally {
      console.groupEnd()
    }
  }
}

export abstract class Stmt {
  public src: string | null

  *run(
    _container: Container, _stack: Frame
  ): Computer<void> {
    throw bug("Define evaluation for", this)
  }
}

export abstract class Expr {
  public src: string | null

  *eval(
    _container: Container, _stack: Frame
  ): Computer<Value> {
    throw bug("Define evaluation for", this)
  }
}

function* runStmt(
  container: Container,
  stack: Frame,
  stmt: Stmt,
): Computer<void> {
  console.group("⦿", stmt.src)
  try {
    yield* stmt.run(container, stack)
  } finally {
    console.groupEnd()
  }
}

function* evalExpr(
  container: Container,
  stack: Frame,
  expr: Expr,
): Computer<Value> {
  console.group("•", expr.src)
  try {
    let result = yield* expr.eval(container, stack)
    console.info("⮑", result)
    return result
  } finally {
    console.groupEnd()
  }
}

export type Decl = TestDecl | VarDecl | FnDecl | FieldDecl

export interface StructDecl {
  name: string
  decls: Map<string, Decl>
}

export interface TestDecl {
  kind: "TestDecl"
  name: string
  body: Lazy<Stmt[]>
}

export interface VarDecl {
  kind: "VarDecl"
  name: string
  mutability: Mutability
  typeExpr: Lazy<Expr>
  initExpr: null | Lazy<Expr>
}

export interface FieldDecl {
  kind: "FieldDecl"
  name: string
  typeExpr: Lazy<Expr>
  initExpr: null | Lazy<Expr>
}

export interface Param {
  name: string
  isComptime: boolean
  typeExpr: Expr | "anytype"
}

export interface FnDecl {
  kind: "FnDecl"
  name: string
  isPublic: boolean
  params: Lazy<Param[]>
  returnTypeExpr: Lazy<Expr>
  body: Lazy<Stmt[]>
}

interface IntType {
  kind: "IntType"
  unsigned: boolean
  bits: number
}

export type Type =
  { kind: "VoidType" } |
  { kind: "TypeType" } |
  { kind: "StructType", container: Container } |
  IntType

// def stmt

export class AssignStmt extends Stmt {
  constructor(
    public lhs: Expr,
    public rhs: Expr,
  ) { super() }
}

export class WhileStmt extends Stmt {
  constructor(
    public test: Expr,
    public payload: string[],
    public step: Expr | null,
    public body: Stmt,
  ) { super () }
}

export class VarStmt extends Stmt {
  constructor (
    public name: string,
    public mutability: Mutability,
    public init: Expr | null,
  ) { super () }

  *run(container: Container, stack: Frame): Computer<void> {
    let value = yield* evalExpr(container, stack, this.init)
    bindWithoutShadowing(
      stack, this.name, Cell.make(value, this.mutability))
  }
}

export class ExprStmt extends Stmt {
  constructor (
    public expr: Expr,
  ) { super () }

  *run(container: Container, stack: Frame): Computer<void> {
    yield* this.expr.eval(container, stack)
  }
}

export class BlockStmt extends Stmt {
  constructor (
    public body: Stmt[],
  ) { super () }
}

// def expr

export type Op2 = "==" | "=" | "+="

export class Op2Expr extends Expr {
  constructor(
    public op: Op2,
    public lhs: Expr,
    public rhs: Expr,
  ) { super() }
}

export class NullExpr extends Expr {
  constructor() { super() }
}

export class ForceExpr extends Expr {
  constructor(
    public expr: Expr,
  ) { super() }
}

export class AddressExpr extends Expr {
  constructor(
    public target: Expr,
  ) { super() }
}

export class LitExpr extends Expr {
  constructor(
    public val: Value,
  ) { super() }

  *eval(_container: Container, _stack: Frame): Computer<Value> {
    return this.val
  }
}

export class CallBuiltinExpr extends Expr {
  constructor(
    public builtin: string,
    public args: Expr[],
  ) { super() }

  *eval(container: Container, stack: Frame): Computer<Value> {
    let args: Value[] = []
    for (let expr of this.args) {
      args.push(yield* expr.eval(container, stack))
    }

    if (this.builtin === "@import") {
      if (args.length !== 1) {
        throw error("@import mismatch", args)
      }

      let arg = args[0]
      if (arg.kind !== "StringValue")
        throw error("@import mismatch", arg)

      if (arg.string === "std.zig") {
        // XXX: we need std.testing.expect
        let decls = new Map<string, Decl>()

        let stdContainer = new Container(
          "std", { name: "std", decls }, new Frame(), null)

        return {
          kind: "InstanceValue",
          container: stdContainer,
          fields: new Map(),
        }

      } else {
        throw bug(this.builtin, arg)
      }
    }
  }
}

export class CallExpr extends Expr {
  constructor(
    public callee: Expr,
    public args: Expr[],
  ) { super() }

  *eval(container: Container, stack: Frame): Computer<Value> {
    const callee = yield* evalExpr(container, stack, this.callee)
    const args = this.args.map(x => evalExpr(container, stack, x))

    if (callee.kind === "FunctionValue") {
      const params = callee.decl.params.read()
      const body = callee.decl.body.read()

      if (params.length !== args.length) {
        throw error("args mismatch", { callee, params, args })
      }

      let frame = new Frame(new Map(), callee.stack)

      let i = 0
      for (let param of params) {
        let arg = yield* args[i++]
        bindWithoutShadowing(
          frame, param.name, Cell.make(arg, Mutability.Constant))
      }

      for (let stmt of body) {
        let computer = stmt.run(container, frame)
        let result = computer.next()
        if (result.done) {
          continue
        } else if (result.value instanceof ReturnSuspension) {
          return result.value.value
        } else {
          throw bug(result)
        }
      }

      throw bug("called function didn't return")
    } else {
      throw bug("calling", callee)
    }
  }
}

export class VarExpr extends Expr {
  constructor(
    public name: string
  ) { super() }

  *eval(container: Container, stack: Frame): Computer<Value> {
    const { name } = this

    const cell = resolve(stack, name) || resolve(container, name)
    if (cell !== undefined) {
      return yield* cell.read()
    } else {
      throw error(`unbound identifier ${this.name}`, {
        expr: this, container, stack
      })
    }
  }
}

export class PrimExpr extends Expr {
  constructor(
    public type: Type
  ) { super() }

  *eval(_container: Container, _stack: Frame): Computer<Value> {
    return { kind: "TypeValue", type: this.type }
  }
}

export class InstanceExpr extends Expr {
  constructor(
    public type: Expr,
    public fields: { name: string, expr: Expr }[],
  ) { super() }

  *eval(container: Container, stack: Frame): Computer<Value> {
    let typeValue = yield* this.type.eval(container, stack)

    if (typeValue.kind !== "TypeValue") {
      throw error("not a type", typeValue)
    }

    let structType = typeValue.type
    if (structType.kind !== "StructType") {
      throw error("not a struct type", structType)
    }

    let fields = new Map<string, Value>()
    for (let field of this.fields) {
      let value = yield* field.expr.eval(container, stack)
      fields.set(field.name, value)
    }

    return {
      kind: "InstanceValue",
      container: structType.container,
      fields,
    }
  }
}

export class TryExpr extends Expr {
  constructor(
    public expr: Expr
  ) { super() }

  *eval(container: Container, stack: Frame): Computer<Value> {
    let x = yield* this.expr.eval(container, stack)
    return x
  }
}

export class ReturnExpr extends Expr {
  constructor(
    public expr: Expr
  ) { super() }

  *eval(container: Container, stack: Frame): Computer<Value> {
    let x = yield* this.expr.eval(container, stack)
    yield new ReturnSuspension(x)
    throw bug("unreachable")
  }
}

export class FieldAccessExpr extends Expr {
  constructor(
    public lhs: Expr,
    public field: string,
  ) { super() }

  *eval(container: Container, stack: Frame): Computer<Value> {
    let lhs = yield* this.lhs.eval(container, stack)
    if (lhs.kind !== "InstanceValue") {
      throw error("not an instance", lhs)
    }

    if (lhs.fields.has(this.field)) {
      return lhs.fields.get(this.field)
    } else {
      // XXX: handle non-field bindings
      throw error(`no field ${this.field}`, { lhs, field: this.field })
    }
  }
}

export class StructExpr extends Expr {
  constructor(
    public decl: StructDecl
  ) { super() }

  *eval(container: Container, stack: Frame): Computer<Value> {
    let struct = new Container(this.decl.name, this.decl, stack, container)
    yield* struct.initialize()
    return {
      kind: "TypeValue",
      type: {
        kind: "StructType",
        container: struct,
      },
    }
  }
}
