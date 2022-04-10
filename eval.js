export let evalFile = (src, tree) => {
  let decls = new Map
  let cursor = tree.cursor()

  if (cursor.firstChild()) do {
    let ident = cursor.node.getChild("Ident")
    let name = src.substring(ident.from, ident.to)

    if (decls.has(name))
      throw new Error(`duplicate decl ${name}`)

    decls.set(name, {
      type: cursor.name,
    })

  } while (cursor.nextSibling())

  return { decls }
}
