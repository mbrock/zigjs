let getText = (node, src) => src.substring(node.from, node.to)
let getChildren = (node, type) => node.getChildren(type)
let getChild = (node, type) => node.getChild(type)
let hasChild = (node, type) => !!getChild(node, type)
let getChildText = (node, type, src) => getText(getChild(node, type), src)

export let evalFile = (src, tree) => {
  let node = tree.topNode
  
  return {
    tests: getChildren(node, "Test").map(x => ({
      name: getChildText(x, "String", src),
      body: getChild(x, "Block"),
    })),

    decls: [
      ...getChildren(node, "VarDecl").map(x => ({
        isPublic: hasChild(x, "pub"),
        isConstant: hasChild(x, "const"),
        name: getChildText(x, "Ident", src),
        type: getChild(x, "Type"),
        init: getChild(x, "Expr"),
      })),
      
      ...getChildren(node, "FnDecl").map(x => ({
        isPublic: hasChild(x, "pub"),
        name: getChildText(x, "Ident", src),
        params: getChildren(x, "ParamDecl").map(y => ({
          isComptime: hasChild(y, "comptime"),
          name: getChildText(y, "Ident", src),
          type: getChild(y, "AnyType") || getChild(y, "Expr"),
        })),
      })),
    ],
  }
}
