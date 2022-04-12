interface IntValue {
  kind: "IntValue"
  int: number
}

type Value = IntValue

class Cell {
  constructor(
    public value: null | Value
  ) {}
}

type Scope = Map<string, Cell>
type Stack = Scope[]

export class Lazy<T> {
  x: T | undefined
  constructor(private f: () => T) {}
  need(): T { return this.x = this.f() }
}

export function lazy<T>(f: () => T): Lazy<T> {
  return new Lazy(f)
}

/// This is a concrete struct type, not a struct instance.
export class Struct {
  parent: null | Struct
  
  constants = new Map<string, Lazy<Value>>()
  variables = new Map<string, Cell>()

  constructor(
    decl: StructDecl
  ) {
    // * Variable declarations are initialized lazily.
    // * We need to detect circular dependencies.
    
    for (const x of decl.decls.values()) {
      const { kind, name } = x
      if (kind == "VarDecl") {
        if (x.isConstant) {
          this.constants.set(
            name, this.lazyInitializer(x))
        } else {
          this.variables.set(
            name, new Cell(evalExpr([], x.initExpr.need())))
        }
      }
    }
  }

  lazyInitializer(x: VarDecl): Lazy<Value> {
    return new Lazy(() => evalExpr([], x.initExpr.need()))
  }
  
  runTests(
    mod: StructDecl,
    predicate: (name: string) => boolean
  ) : void {
    console.groupCollapsed("⚙", "module:", mod.name)
    console.log(mod.decls)
    console.groupEnd()
    
    for (let decl of mod.decls.values()) {
      if (decl.kind == "TestDecl") {
        if (predicate.call(null, decl.name)) {
          this.runTest(decl)
        } else {
          console.info("skipping", decl.name)
        }
      }
    }
  }

  runTest(decl: TestDecl): void {
    try {
      console.group("🤓", "Test:", decl.name)
      let body = decl.body.need()
      let stack = [new Map<string, Cell>()]
      for (let stmt of body) {
        runStmt(stack, stmt)
      }
    } finally {
      console.groupEnd()
    }
  }
}

export abstract class Stmt {
  public src: string | null
  
  run(_stack: Stack): void {
    throw bug("Define evaluation for", this)
  }
}

export abstract class Expr {
  public src: string | null
  
  eval(_stack: Stack): Value {
    throw bug("Define evaluation for", this)
  }
}

function runStmt(stack: Stack, stmt: Stmt): void {
  console.group("⦿", stmt.src)
  try {
    stmt.run(stack)
  } finally {
    console.groupEnd()
  }
}

function evalExpr(stack: Stack, expr: Expr): Value {
  console.group("•", expr.src)
  try {
    let result = expr.eval(stack)
    console.info("⮑", result)
    return result
  } finally {
    console.groupEnd()
  }
}

export class ZigBug extends Error {
  constructor(...msg: string[]) { super(msg.join(" ")) }
}

export function bug(...x: any[]): Error {
  console.error(...x)
  debugger
  return new ZigBug(...x.map(x => x.toString()))
}

class ZigError extends Error {
  constructor(msg: string, public data: any) { super(msg) }
}

function error(x: string, data: any): Error {
  console.error("𝍐", x)
  return new ZigError(x, data)
}

export type Decl = TestDecl | VarDecl | FnDecl

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
  isConstant: boolean
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
    public init: Expr | null,
  ) { super () }

  run(stack: Stack): void {
    let [scope] = stack
    scope.set(
      this.name,
      new Cell(this.init ? evalExpr(stack, this.init) : null)
    )
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

  eval(stack: Stack): Value {
    let callee = evalExpr(stack, this.callee)
    let args = this.args.map(x => evalExpr(stack, x))

    throw bug("implement call expr", callee, args)
  }
}

export class VarExpr extends Expr {
  constructor(
    public name: string
  ) { super() }

  eval(stack: Stack): Value {
    for (let scope of stack) {
      if (scope.has(this.name)) {
        let { value } = scope.get(this.name)
        if (value === undefined) {
          throw error(`used empty local variable ${this.name}`, {
            expr: this,
            stack,
            scope,
          })
        } else {
          return value
        }
      }
    }

    throw error(`reference to unknown symbol ${this.name}`, {
      expr: this, stack
    })
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

// type LazyScope = Map<string, Lazy<Cell>>
