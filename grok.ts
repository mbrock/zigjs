import { SyntaxNode } from "@lezer/common"

import * as Zig from "./zigeval"

type ExprNodeName =
  "Number" | "Exp1" | "Call" | "Ident" | "Prim" |
  "Instantiation" | "Try" | "FieldAccess" | "AddressOf" |
  "Equals" | "PlusAssign" | "ForceField" | "null"

type DeclNodeName = "TestDecl" | "VarDecl" | "FnDecl"

export function grokFile(
  src: string, name: string, node: SyntaxNode
): Zig.StructDecl {
  return new Grok(src).grokStruct(name, node)
}

const primTypes: Record<string, Zig.Type> = {
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

function getChildren(
  node: SyntaxNode, type: string
): SyntaxNode[] {
  return node.getChildren(type)
}

function getChild(
  node: SyntaxNode, type: string
): SyntaxNode {
  return node.getChild(type)
}

function hasChild(
  node: SyntaxNode, type: string
): boolean {
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
  ): Zig.StructDecl {
    return {
      name,
      decls: this.grokDecls(getChildren(node, "Decl"))
    }
  }

  grokDecls(
    declNodes: SyntaxNode[]
  ): Map<string, Zig.Decl> {
    let map = new Map<string, Zig.Decl>()

    for (let declNode of declNodes) {
      let decl = this.grokDecl(declNode)
      map.set(decl.name, decl)
    }

    return map
  }

  grokDecl(
    declNode: SyntaxNode
  ): Zig.Decl {
    let x = declNode.firstChild
    let kind = x.name as DeclNodeName

    switch (kind) {
      case "TestDecl":
        return {
          kind,
          name: this.getChildText(x, "String").slice(1, -1),
          body: Zig.lazy(() =>
            getChildren(
              getChild(x, "Block"), "Stmt"
            ).map(stmt => this.grokStmt(stmt))),
        }

      case "VarDecl":
        return {
          kind,
          name: this.getChildText(x, "Ident"),
          mutability: hasChild(x, "const")
            ? Zig.Mutability.Constant
            : Zig.Mutability.Variable,
          typeExpr: Zig.lazy(() =>
            this.grokExpr(getChild(x, "Type"))),
          initExpr: hasChild(x, "Expr")
            ? Zig.lazy(() => this.grokExpr(getChild(x, "Expr")))
            : null,
        }

      case "FnDecl":
        return {
          kind,
          name: this.getChildText(x, "Ident"),
          isPublic: hasChild(x, "pub"),
          params: Zig.lazy(() =>
            getChildren(x, "ParamDecl")
              .map(x => this.grokParam(x))),
          returnTypeExpr: Zig.lazy(() =>
            this.grokExpr(getChild(x, "Exp1"))),
          body: Zig.lazy(() =>
            getChildren(x, "Stmt").map(y => this.grokStmt(y))),
        }

      default: throw Zig.bug("grok decl", kind)
    }
  }

  grokParam(n: SyntaxNode): Zig.Param {
    return {
      name: this.getChildText(n, "Ident"),
      isComptime: hasChild(n, "comptime"),
      typeExpr: hasChild(n, "AnyType")
        ? "anytype"
        : this.grokExpr(getChild(n, "Expr")),
    }
  }

  grokStmt(stmtNode: SyntaxNode): Zig.Stmt {
    let stmt = this.grokStmt_(stmtNode)
    stmt.src = this.getText(stmtNode)
    return stmt
  }

  grokStmt_(stmtNode: SyntaxNode): Zig.Stmt {
    let x = stmtNode.firstChild
    let kind = x.name
    switch (kind) {
      case "VarDecl": return new Zig.VarStmt(
        this.getChildText(x, "Ident"),
        hasChild(x, "const")
          ? Zig.Mutability.Constant
          : Zig.Mutability.Variable,
        hasChild(x, "Expr")
          ? this.grokExpr(getChild(x, "Expr"))
          : null,
      )

      case "Expr": return new Zig.ExprStmt(
        this.grokExpr(x),
      )

      case "Block": return new Zig.BlockStmt(
        getChildren(x, "Stmt").map(y => this.grokStmt(y)),
      )

      case "While": return new Zig.WhileStmt(
        this.grokExpr(getChild(x, "Expr")),
        getChildren(x, "Ident").map(x => this.getText(x)),
        getChild(x, "Assignment")
          && this.grokBinop(getChild(x, "Assignment"), "="),
        this.grokStmt(getChild(x, "Stmt")),
      )

      case "Assignment": return new Zig.AssignStmt(
        this.grokExpr(getChildren(x, "Expr")[0]),
        this.grokExpr(getChildren(x, "Expr")[1]),
      )

      default: throw Zig.bug("grok stmt", kind)
    }
  }

  grokExpr(x: SyntaxNode): Zig.Expr {
    let expr = this.grokExpr_(x)
    expr.src = this.getText(x)
    return expr
  }

  grokExpr_(exprNode: SyntaxNode): Zig.Expr {
    let x = exprNode.firstChild
    let kind = x.name
    switch (x.name as ExprNodeName) {
      case "Exp1": return this.grokExpr(x)

      case "Call": return new Zig.CallExpr(
        this.grokExpr(getChild(x, "Exp1")),
        getChildren(x, "Expr").map(y => this.grokExpr(y)),
      )

      case "Ident": return new Zig.VarExpr(
        this.getText(x),
      )

      case "Prim": return new Zig.PrimExpr(
        primTypes[this.getText(x)],
      )

      case "Number": return new Zig.NumberExpr(
        parseInt(this.getText(x)),
      )

      case "AddressOf": return new Zig.AddressExpr(
        this.grokExpr(getChild(x, "Exp1")),
      )

      case "Instantiation": return new Zig.InstanceExpr(
        this.grokExpr(getChild(x, "Exp1")),
        getChildren(x, "FieldInit")
          .map(y => this.grokFieldInit(y)),
      )

      case "Try": return new Zig.TryExpr(
        this.grokExpr(getChild(x, "Expr")),
      )

      case "FieldAccess": return new Zig.FieldAccessExpr(
        this.grokExpr(getChild(x, "Exp1")),
        this.getChildText(x, "Ident"),
      )

      case "Equals"     : return this.grokBinop(x, "==")
      case "PlusAssign" : return this.grokBinop(x, "+=")

      case "ForceField": return new Zig.ForceExpr(
        this.grokExpr(getChild(x, "Exp1")),
      )

      case "null": return new Zig.NullExpr

      default: throw Zig.bug("grok expr", kind)
    }
  }

  grokFieldInit(x: SyntaxNode): { name: string, expr: Zig.Expr } {
    return {
      name: this.getChildText(x, "Ident"),
      expr: this.grokExpr(getChild(x, "Expr")),
    }
  }

  grokBinop(x: SyntaxNode, name: Zig.Op2): Zig.Op2Expr {
    let [lhs, rhs] = getChildren(x, "Expr")
    return new Zig.Op2Expr(
      name,
      this.grokExpr(lhs),
      this.grokExpr(rhs),
    )
  }
}
