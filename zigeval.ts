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

function bug(...x: string[]): Error {
  debugger
  return new ZigBug(...x)
}

// class ZigError extends Error {
//   constructor(msg: string) { super(msg) }
// }

// function error(x: string): Error {
//   return new ZigError(x)
// }

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

type Stmt = VarStmt | ExprStmt | BlockStmt | WhileStmt | AssignStmt

interface AssignStmt {
  kind: "AssignStmt"
  lhs: Expr
  rhs: Expr
}

interface WhileStmt {
  kind: "WhileStmt"
  test: Expr
  payload: string[]
  step: Expr | null
  body: Stmt
}

interface VarStmt {
  kind: "VarStmt"
  name: string
  init: Expr | null
}

interface ExprStmt {
  kind: "ExprStmt"
  expr: Expr
}

interface BlockStmt {
  kind: "BlockStmt"
  body: Stmt[]
}

// def expr

type ExprNodeName =
  "Number" | "Exp1" | "Call" | "Ident" | "Prim" |
  "Instantiation" | "Try" | "FieldAccess" | "AddressOf" |
  "Equals" | "PlusAssign" | "ForceField" | "null"

type Expr =
  CallExpr | VarExpr | PrimExpr | TypeExpr | InstanceExpr |
  TryExpr | FieldAccessExpr | Op2Expr | NumberExpr | AddressExpr |
  ForceExpr | NullExpr

type Op2 = "==" | "=" | "+="

interface NullExpr {
  kind: "NullExpr"
}

interface ForceExpr {
  kind: "ForceExpr"
  expr: Expr
}

interface Op2Expr {
  kind: "Op2Expr"
  op: Op2
  lhs: Expr
  rhs: Expr
}

interface AddressExpr {
  kind: "AddressExpr"
  target: Expr
}

interface NumberExpr {
  kind: "NumberExpr"
  val: number // should use BigInteger
}

interface TypeExpr {
  kind: "TypeExpr"
  type: Type
}

interface CallExpr {
  kind: "CallExpr"
  calleeExpr: Expr
  argExprs: Expr[]
}

interface VarExpr {
  kind: "VarExpr"
  name: string
}

interface PrimExpr {
  kind: "PrimExpr"
  type: Type
}

interface InstanceExpr {
  kind: "InstanceExpr"
  typeExpr: Expr
  fieldExprs: { name: string, expr: Expr }[],
}

interface TryExpr {
  kind: "TryExpr"
  expr: Expr
}

interface FieldAccessExpr {
  kind: "FieldAccessExpr"
  lhs: Expr
  fieldName: string
}

interface TestDecl {
  kind: "TestDecl"
  name: string
  body: Lazy<Stmt[]>
}

interface VarDecl {
  kind: "VarDecl"
  name: string
  typeExpr: Lazy<Expr>
  initExpr: Lazy<Expr>
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
          typeExpr: lazy(() => this.grokExpr(getChild(x, "Type"))),
          initExpr: lazy(() => this.grokExpr(getChild(x, "Expr"))),
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
    let x = stmtNode.firstChild
    let kind = x.name
    switch (kind) {
      case "VarDecl": return {
        kind: "VarStmt",
        name: this.getChildText(x, "Ident"),
        init: hasChild(x, "Expr")
          ? this.grokExpr(getChild(x, "Expr"))
          : null,
      }

      case "Expr": return {
        kind: "ExprStmt",
        expr: this.grokExpr(x),
      }

      case "Block": return {
        kind: "BlockStmt",
        body: getChildren(x, "Stmt").map(y => this.grokStmt(y))
      }

      case "While": return {
        kind: "WhileStmt",
        test: this.grokExpr(getChild(x, "Expr")),
        payload: getChildren(x, "Ident").map(x => this.getText(x)),
        step: getChild(x, "Assignment")
          && this.grokBinop(getChild(x, "Assignment"), "="),
        body: this.grokStmt(getChild(x, "Stmt")),
      }

      case "Assignment": return {
        kind: "AssignStmt",
        lhs: this.grokExpr(getChildren(x, "Expr")[0]),
        rhs: this.grokExpr(getChildren(x, "Expr")[1]),
      }
        
      default: throw bug("grok stmt", kind)
    }
  }

  grokExpr(exprNode: SyntaxNode): Expr {
    let x = exprNode.firstChild
    let kind = x.name
    switch (x.name as ExprNodeName) {
      case "Exp1": return this.grokExpr(x)

      case "Call": return {
        kind: "CallExpr",
        calleeExpr: this.grokExpr(getChild(x, "Exp1")),
        argExprs: getChildren(x, "Expr").map(y => this.grokExpr(y)),
      }

      case "Ident": return {
        kind: "VarExpr",
        name: this.getText(x),
      }

      case "Prim": return {
        kind: "TypeExpr",
        type: primTypes[this.getText(x)],
      }

      case "Number": return {
        kind: "NumberExpr",
        val: parseInt(this.getText(x)),
      }

      case "AddressOf": return {
        kind: "AddressExpr",
        target: this.grokExpr(getChild(x, "Exp1")),
      }

      case "Instantiation": return {
        kind: "InstanceExpr",
        typeExpr: this.grokExpr(getChild(x, "Exp1")),
        fieldExprs: getChildren(x, "FieldInit")
          .map(y => this.grokFieldInit(y)),
      }

      case "Try": return {
        kind: "TryExpr",
        expr: this.grokExpr(getChild(x, "Expr")),
      }

      case "FieldAccess": return {
        kind: "FieldAccessExpr",
        lhs: this.grokExpr(getChild(x, "Exp1")),
        fieldName: this.getChildText(x, "Ident"),
      }

      case "Equals":
        return this.grokBinop(x, "==")

      case "PlusAssign":
        return this.grokBinop(x, "+=")

      case "ForceField": return {
        kind: "ForceExpr",
        expr: this.grokExpr(getChild(x, "Exp1")),
      }

      case "null": return {
        kind: "NullExpr",
      }
        
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
    return {
      kind: "Op2Expr",
      op: name,
      lhs: this.grokExpr(lhs),
      rhs: this.grokExpr(rhs),
    }
  }
}

interface IntValue {
  kind: "IntValue"
  int: number
}

type Value = IntValue

type Cell = {
  value: undefined | Value
}

// interface CellPointer {
//   kind: "cellPointer"
//   cell: Cell
// }

// type Pointer = CellPointer

type Stack = Map<string, Cell>[]

export class Zig {
  evalTests(
    mod: StructDecl,
    predicate: (name: string) => boolean
  ) : void {
    console.log(mod)
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
      console.group("test", decl.name)
      let body = decl.body.need()
      let stack = [new Map<string, Cell>()]
      for (let stmt of body) {
        this.runStmt(stack, stmt)
      }
    } finally {
      console.groupEnd()
    }
  }

  runStmt(stack: Stack, stmt: Stmt): void {
    console.log(stack, stmt)
  }
}

export function grokFile(
  src: string, name: string, node: SyntaxNode
): StructDecl {
  return new Grok(src).grokStruct(name, node)
}
