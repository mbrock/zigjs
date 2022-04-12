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

export enum Mutability {
  Constant = "Constant",
  Variable = "Variable",
}

export class Cell<T, Meta = null> {
  content: T | undefined
  state: "have" | "need" | "busy" = "need"
  
  constructor(
    public mutability: Mutability,
    private thunk: () => T,
    public meta: Meta,
  ) {}

  get value() {
    switch (this.state) {
      case "have": return this.content
      case "busy": throw error("circular dependency", this)
      case "need": {
        this.state = "busy"
        this.content = this.thunk()
        this.state = "have"
        return this.content
      }
    }
  }
  
  set value(x: T) {
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
): Cell<T, Meta> {
  return new Cell(mutability, thunk, meta)
}

export function eager<T, Meta>(
  value: T,
  mutability: Mutability = Mutability.Constant,
  meta: Meta = null,
): Cell<T, Meta> {
  return lazy(() => value, mutability, meta)
}

interface IntValue {
  kind: "IntValue"
  int: number
}

type Value = IntValue

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
    public name: string = "anonymous",
    public decl: StructDecl,
    public stack: Frame,
    public parent: null | Container = null,
  ) {
    for (const x of decl.decls.values()) {
      const { kind, name } = x
      let thunk: () => Value
      
      if (kind == "VarDecl") {
        thunk = () => evalExpr(this, this.stack, x.initExpr.value)
      } else if (kind == "FnDecl") {
        thunk = () => { throw bug("implement functions") }
      } else if (kind == "TestDecl") {
        thunk = () => { throw bug("implement tests") }
      } else {
        throw bug(kind)
      }

      bindWithoutShadowing(
        this, name, lazy(thunk, Mutability.Constant, x))
    }
  }
  
  runTests(
    predicate: (name: string) => boolean
  ): void {
    console.groupCollapsed("⚙", "Bindings for", this.name)
    console.log(this.bindings)
    console.groupEnd()
    
    for (const cell of this.bindings.values()) {
      const { kind, name } = cell.meta
      if (kind == "TestDecl") {
        if (predicate.call(null, name)) {
          this.runTest(name, cell.meta)
        } else {
          console.info("skipping", name)
        }
      }
    }
  }

  runTest(name: string, decl: TestDecl): void {
    try {
      console.group("🤓", "Test:", name)
      let body = decl.body.value
      for (let stmt of body) {
        runStmt(this, this.stack, stmt)
      }
    } finally {
      console.groupEnd()
    }
  }
}

export abstract class Stmt {
  public src: string | null
  
  run(_container: Container, _stack: Frame): void {
    throw bug("Define evaluation for", this)
  }
}

export abstract class Expr {
  public src: string | null
  
  eval(_container: Container, _stack: Frame): Value {
    throw bug("Define evaluation for", this)
  }
}

function runStmt(
  container: Container,
  stack: Frame,
  stmt: Stmt,
): void {
  console.group("⦿", stmt.src)
  try {
    stmt.run(container, stack)
  } finally {
    console.groupEnd()
  }
}

function evalExpr(
  container: Container,
  stack: Frame,
  expr: Expr,
): Value {
  console.group("•", expr.src)
  try {
    let result = expr.eval(container, stack)
    console.info("⮑", result)
    return result
  } finally {
    console.groupEnd()
  }
}

export type Decl = TestDecl | VarDecl | FnDecl

export interface StructDecl {
  name: string
  decls: Map<string, Decl>
}

export interface TestDecl {
  kind: "TestDecl"
  name: string
  body: Cell<Stmt[]>
}

export interface VarDecl {
  kind: "VarDecl"
  name: string
  mutability: Mutability
  typeExpr: Cell<Expr>
  initExpr: null | Cell<Expr>
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
  params: Cell<Param[]>
  returnTypeExpr: Cell<Expr>
  body: Cell<Stmt[]>
}

interface IntType {
  kind: "IntType"
  unsigned: boolean
  bits: number
}

export type Type =
  { kind: "VoidType" } |
  { kind: "TypeType" } |
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

  run(container: Container, stack: Frame): void {
    let value = evalExpr(container, stack, this.init)
    bindWithoutShadowing(
      stack, this.name, eager(value, this.mutability))
  }
}

export class ExprStmt extends Stmt {
  constructor (
    public expr: Expr,
  ) { super () }
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

export class NumberExpr extends Expr {
  constructor(
    public val: number,
  ) { super() }
}

export class CallExpr extends Expr {
  constructor(
    public callee: Expr,
    public args: Expr[],
  ) { super() }

  eval(container: Container, stack: Frame): Value {
    let callee = evalExpr(container, stack, this.callee)
    let args = this.args.map(x => evalExpr(container, stack, x))

    throw bug("implement call expr", callee, args)
  }
}

export class VarExpr extends Expr {
  constructor(
    public name: string
  ) { super() }

  eval(container: Container, stack: Frame): Value {
    const { name } = this
    
    const cell = resolve(stack, name) || resolve(container, name)
    if (cell !== undefined) {
      return cell.value
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
}

export class InstanceExpr extends Expr {
  constructor(
    public type: Expr,
    public fields: { name: string, expr: Expr }[],
  ) { super() }
}

export class TryExpr extends Expr {
  constructor(
    public expr: Expr
  ) { super() }
}

export class FieldAccessExpr extends Expr {
  constructor(
    public lhs: Expr,
    public field: string,
  ) { super() }
}
