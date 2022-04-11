import { SyntaxNode } from "@lezer/common"

class Lazy<T> {
  x: T | undefined
  constructor(private f: () => T) {}
  need(): T { return this.x = this.f() }
}

function lazy<T>(f: () => T): Lazy<T> {
  return new Lazy(f)
}

class ZigBug extends Error {
  constructor(...msg: string[]) { super(msg.join(" ")) }
}

function bug(...x: any[]): Error {
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

interface IntType {
  kind: "IntType"
  unsigned: boolean
  bits: number
}

type Type =
    { kind: "VoidType" }
  | { kind: "TypeType" }
  | IntType

// def stmt

abstract class Stmt {
  public src: string | null
  
  run(stack: Stack): void {
    throw bug("run", this, stack)
  }
}

// type Stmt = VarStmt | ExprStmt | BlockStmt | WhileStmt | AssignStmt

class AssignStmt extends Stmt {
  constructor(
    public lhs: Expr,
    public rhs: Expr,
  ) { super() }
}

class WhileStmt extends Stmt {
  constructor(
    public test: Expr,
    public payload: string[],
    public step: Expr | null,
    public body: Stmt,
  ) { super () }
}

class VarStmt extends Stmt {
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

class ExprStmt extends Stmt {
  constructor (
    public expr: Expr,
  ) { super () }
}

class BlockStmt extends Stmt {
  constructor (
    public body: Stmt[],
  ) { super () }
}

// def expr

type ExprNodeName =
  "Number" | "Exp1" | "Call" | "Ident" | "Prim" |
  "Instantiation" | "Try" | "FieldAccess" | "AddressOf" |
  "Equals" | "PlusAssign" | "ForceField" | "null"

class Expr {
  public src: string | null
  
  eval(_stack: Stack): Value {
    throw bug("Define evaluation for", this)
  }
}

type Op2 = "==" | "=" | "+="

class NullExpr extends Expr {
  constructor() { super() }
}

class ForceExpr extends Expr {
  constructor(
    public expr: Expr,
  ) { super() }
}

class Op2Expr extends Expr {
  constructor(
    public op: Op2,
    public lhs: Expr,
    public rhs: Expr,
  ) { super() }
}

class AddressExpr extends Expr {
  constructor(
    public target: Expr,
  ) { super() }
}

class NumberExpr extends Expr {
  constructor(
    public val: number,
  ) { super() }
}

// class TypeExpr extends Expr {
//   constructor(
//     public type: Type,
//   ) { super() }
// }

class CallExpr extends Expr {
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

class VarExpr extends Expr {
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

class PrimExpr extends Expr {
  constructor(
    public type: Type
  ) { super() }
}

class InstanceExpr extends Expr {
  constructor(
    public type: Expr,
    public fields: { name: string, expr: Expr }[],
  ) { super() }
}

class TryExpr extends Expr {
  constructor(
    public expr: Expr
  ) { super() }
}

class FieldAccessExpr extends Expr {
  constructor(
    public lhs: Expr,
    public field: string,
  ) { super() }
}

interface TestDecl {
  kind: "TestDecl"
  name: string
  body: Lazy<Stmt[]>
}

interface VarDecl {
  kind: "VarDecl"
  name: string
  isConstant: boolean
  typeExpr: Lazy<Expr>
  initExpr: null | Lazy<Expr>
}

interface Param {
  name: string
  isComptime: boolean
  typeExpr: Expr | "anytype"
}

interface FnDecl {
  kind: "FnDecl"
  name: string
  isPublic: boolean
  params: Lazy<Param[]>
  returnTypeExpr: Lazy<Expr>
  body: Lazy<Stmt[]>
}

const primTypes: Record<string, Type> = {
  void: { kind: "VoidType" },
  type: { kind: "TypeType" },

  u32: {
    kind: "IntType",
    unsigned: true,
    bits: 32,
  },

  usize: {
    kind: "IntType",
    unsigned: true,
    bits: 32,
  },
}

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

// type LazyScope = Map<string, Lazy<Cell>>

type Scope = Map<string, Cell>
type Stack = Scope[]

/// This is a concrete struct type, not a struct instance.
export class Struct {
  parent: null | Struct
  
  constants = new Map<string, Lazy<Value>>()
  variables = new Map<string, Cell>()

  circularity = new Set<string>()

  constructor(
    decl: StructDecl
  ) {
    // * Variable declarations are initialized lazily.
    // * We need to detect circular dependencies.
    
    for (const x of decl.decls.values()) {
      const { kind, name } = x
      if (kind == "VarDecl") {
        if (x.isConstant) {
          this.constants.set(name, this.lazyInitializer(x))
        } else {
          this.variables.set(name, new Cell(evalExpr([], x.initExpr.need())))
        }
      }
    }
  }


  lazyInitializer(x: VarDecl): Lazy<Value> {
    let { name } = x
    return new Lazy(() => {
      if (this.circularity.has(name)) {
        throw error("circularity", name)
      } else {
        this.circularity.add(name)
        try {
          let value = evalExpr([], x.initExpr.need())
          return value
        } finally {
          this.circularity.delete(name)
        }
      }
    })
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

export function grokFile(
  src: string, name: string, node: SyntaxNode
): StructDecl {
  return new Grok(src).grokStruct(name, node)
}

type DeclNodeName = "TestDecl" | "VarDecl" | "FnDecl"

type Decl = TestDecl | VarDecl | FnDecl

interface StructDecl {
  name: string
  decls: Map<string, Decl>
}

function getChildren(node: SyntaxNode, type: string): SyntaxNode[] {
  return node.getChildren(type)
}

function getChild(node: SyntaxNode, type: string): SyntaxNode {
  return node.getChild(type)
}

function hasChild(node: SyntaxNode, type: string): boolean {
  return !!getChild(node, type)
}

class Grok {
  constructor(public src: string) {
  }

  getText(node: SyntaxNode) {
    return this.src.slice(node.from, node.to)
  }

  getChildText(node: SyntaxNode, type: string) {
    return this.getText(getChild(node, type))
  }

  grokStruct(
    name: string, node: SyntaxNode
  ): StructDecl {
    return {
      name,
      decls: this.grokDecls(getChildren(node, "Decl"))
    }
  }

  grokDecls(
    declNodes: SyntaxNode[]
  ): Map<string, Decl> {
    let map = new Map<string, Decl>()

    for (let declNode of declNodes) {
      let decl = this.grokDecl(declNode)
      map.set(decl.name, decl)
    }

    return map
  }

  grokDecl(
    declNode: SyntaxNode
  ): Decl {
    let x = declNode.firstChild
    let kind = x.name as DeclNodeName
    
    switch (kind) {
      case "TestDecl":
        return {
          kind,
          name: this.getChildText(x, "String").slice(1, -1),
          body: lazy(() =>
            getChildren(
              getChild(x, "Block"), "Stmt"
            ).map(stmt => this.grokStmt(stmt))),
        }

      case "VarDecl":
        return {
          kind,
          name: this.getChildText(x, "Ident"),
          isConstant: hasChild(x, "const"),
          typeExpr: lazy(() => this.grokExpr(getChild(x, "Type"))),
          initExpr: hasChild(x, "Expr")
            ? lazy(() => this.grokExpr(getChild(x, "Expr")))
            : null,
        }

      case "FnDecl":
        return {
          kind,
          name: this.getChildText(x, "Ident"),
          isPublic: hasChild(x, "pub"),
          params: lazy(() =>
            getChildren(x, "ParamDecl")
              .map(x => this.grokParam(x))),
          returnTypeExpr: lazy(() =>
            this.grokExpr(getChild(x, "Exp1"))),
          body: lazy(() =>
            getChildren(x, "Stmt").map(y => this.grokStmt(y))),
        }
        
      default: throw bug("grok decl", kind)
    }
  }

  grokParam(n: SyntaxNode): Param {
    return {
      name: this.getChildText(n, "Ident"),
      isComptime: hasChild(n, "comptime"),
      typeExpr: hasChild(n, "AnyType")
        ? "anytype"
        : this.grokExpr(getChild(n, "Expr")),
    }
  }

  grokStmt(stmtNode: SyntaxNode): Stmt {
    let stmt = this.grokStmt_(stmtNode)
    stmt.src = this.getText(stmtNode)
    return stmt
  }
  
  grokStmt_(stmtNode: SyntaxNode): Stmt {
    let x = stmtNode.firstChild
    let kind = x.name
    switch (kind) {
      case "VarDecl": return new VarStmt(
        this.getChildText(x, "Ident"),
        hasChild(x, "Expr")
          ? this.grokExpr(getChild(x, "Expr"))
          : null,
      )

      case "Expr": return new ExprStmt(
        this.grokExpr(x),
      )

      case "Block": return new BlockStmt(
        getChildren(x, "Stmt").map(y => this.grokStmt(y)),
      )

      case "While": return new WhileStmt(
        this.grokExpr(getChild(x, "Expr")),
        getChildren(x, "Ident").map(x => this.getText(x)),
        getChild(x, "Assignment")
          && this.grokBinop(getChild(x, "Assignment"), "="),
        this.grokStmt(getChild(x, "Stmt")),
      )

      case "Assignment": return new AssignStmt(
        this.grokExpr(getChildren(x, "Expr")[0]),
        this.grokExpr(getChildren(x, "Expr")[1]),
      )
        
      default: throw bug("grok stmt", kind)
    }
  }

  grokExpr(x: SyntaxNode): Expr {
    let expr = this.grokExpr_(x)
    expr.src = this.getText(x)
    return expr
  }

  grokExpr_(exprNode: SyntaxNode): Expr {
    let x = exprNode.firstChild
    let kind = x.name
    switch (x.name as ExprNodeName) {
      case "Exp1": return this.grokExpr(x)

      case "Call": return new CallExpr(
        this.grokExpr(getChild(x, "Exp1")),
        getChildren(x, "Expr").map(y => this.grokExpr(y)),
      )

      case "Ident": return new VarExpr(
        this.getText(x),
      )

      case "Prim": return new PrimExpr(
        primTypes[this.getText(x)],
      )

      case "Number": return new NumberExpr(
        parseInt(this.getText(x)),
      )

      case "AddressOf": return new AddressExpr(
        this.grokExpr(getChild(x, "Exp1")),
      )

      case "Instantiation": return new InstanceExpr(
        this.grokExpr(getChild(x, "Exp1")),
        getChildren(x, "FieldInit")
          .map(y => this.grokFieldInit(y)),
      )

      case "Try": return new TryExpr(
        this.grokExpr(getChild(x, "Expr")),
      )

      case "FieldAccess": return new FieldAccessExpr(
        this.grokExpr(getChild(x, "Exp1")),
        this.getChildText(x, "Ident"),
      )

      case "Equals"     : return this.grokBinop(x, "==")
      case "PlusAssign" : return this.grokBinop(x, "+=")

      case "ForceField": return new ForceExpr(
        this.grokExpr(getChild(x, "Exp1")),
      )

      case "null": return new NullExpr
        
      default: throw bug("grok expr", kind)
    }
  }

  grokFieldInit(x: SyntaxNode): { name: string, expr: Expr } {
    return {
      name: this.getChildText(x, "Ident"),
      expr: this.grokExpr(getChild(x, "Expr")),
    }
  }

  grokBinop(x: SyntaxNode, name: Op2): Op2Expr {
    let [lhs, rhs] = getChildren(x, "Expr")
    return new Op2Expr(
      name,
      this.grokExpr(lhs),
      this.grokExpr(rhs),
    )
  }
}

