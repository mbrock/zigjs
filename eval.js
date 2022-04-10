let getText = (src, node) => src.slice(node.from, node.to)
let getChildren = (node, type) => node.getChildren(type)
let getChild = (node, type, opts = {}) => (
  node.getChild(type, opts.before, opts.after))
let hasChild = (node, type) => !!getChild(node, type)
let getChildText = (src, node, type) => getText(src, getChild(node, type))

let binopGrok = (src, x) => ({
  lhs: grokExpr(src, getChild(x, "Expr")),
  rhs: grokExpr(src, getChild(x, { after: "Expr" })),
})

let grok = {
  expr: {
    Expr: (src, x) => grokExpr(src, x),
    Exp1: (src, x) => grokExpr(src, x),
    
    Number: (src, x) => ({
      value: getText(src, x),
    }),
    
    String: (src, x) => ({
      value: getText(src, x).slice(1, -1),
    }),

    "null": () => ({}),

    Ident: (src, x) => ({
      value: getText(src, x),
    }),
    
    AtIdent: (src, x) => ({
      value: getText(src, x),
    }),

    Return: (src, x) => ({
      value: grokExpr(src, getChild(x, "Expr")),
    }),

    Try: (src, x) => ({
      body: grokExpr(src, getChild(x, "Expr")),
    }),

    OrElse: (src, x) => ({
      optional: grokExpr(src, getChild(x, "Expr")),
      handler: grokExpr(src, getChild(x, "Expr", { after: "Expr" })),
    }),

    AddressOf: (src, x) => ({
      value: grokExpr(src, getChild(x, "Exp1")),
    }),

    Equals: binopGrok,
    NotEquals: binopGrok,
    Plus: binopGrok,
    Minus: binopGrok,
    Or: binopGrok,
    And: binopGrok,

    Call: (src, x) => ({
      callee: grokExpr(src, getChild(x, "Exp1")),
      args: getChildren(x, "Expr").map(y => grokExpr(src, y)),
    }),

    FieldAccess: (src, x) => ({
      thing: grokExpr(src, getChild(x, "Exp1")),
      field: getChildText(src, x, "Ident"),
    }),

    Prim: (src, x) => ({
      name: getText(src, x),
    }),
  }
}

export let grokExpr = (src, node) => {
  let kind = node.firstChild.name
  let fn = grok.expr[kind]
  if (fn)
    return { kind, ...fn(src, node.firstChild) }
  else
    throw new Error(`no ${kind} kind`)
}

export let grokFile = (src, tree) => {
  let node = tree.topNode
  
  return {
    tests: getChildren(node, "Test").map(x => ({
      name: getChildText(src, x, "String"),
      body: getChild(x, "Block"),
    })),

    decls: [
      ...getChildren(node, "VarDecl").map(x => ({
        kind: "variable",
        isPublic: hasChild(x, "pub"),
        isConstant: hasChild(x, "const"),
        name: getChildText(src, x, "Ident"),
        type: getChild(x, "Type"),
        init: grokExpr(src, getChild(x, "Expr")),
      })),
      
      ...getChildren(node, "FnDecl").map(x => ({
        kind: "function",
        isPublic: hasChild(x, "pub"),
        name: getChildText(src, x, "Ident"),
        returnType: grokExpr(src, getChild(x, "Exp1")),
        params: getChildren(x, "ParamDecl").map(y => ({
          isComptime: hasChild(y, "comptime"),
          name: getChildText(src, y, "Ident"),
          type: grokExpr(src, getChild(y, "AnyType") || getChild(y, "Expr")),
        })),
      })),
    ],
  }
}
