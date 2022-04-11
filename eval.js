let getText = (src, node) => src.slice(node.from, node.to)
let getChildren = (node, type) => node.getChildren(type)
let getChild = (node, type, opts = {}) => (
  node.getChild(type, opts.before, opts.after))
let hasChild = (node, type) => !!getChild(node, type)
let getChildText = (src, node, type) => getText(src, getChild(node, type))

export let grokOneOf = cases => (src, node) => {
  let kind = node.firstChild.name
  return grouping(kind, () => {
    let fn = cases[kind]
    if (fn) {
      return {
        kind,
        src: getText(src, node),
        ...fn(src, node.firstChild),
      }
    } else
      throw new Error(`no ${kind} kind`)
  })
}

let binopGrok = (src, x) => ({
  lhs: grokExpr(src, getChildren(x, "Expr")[0]),
  rhs: grokExpr(src, getChildren(x, "Expr")[1]),
})

let grokStmt = grokOneOf({
  Expr: (src, x) => ({ expr: grokExpr(src, x) }),
  Assignment: binopGrok,
  If: (src, x) => ({
    test: grokExpr(src, getChild(x, "Expr")),
    payload: getChildren(x, "Ident").map(x => getText(src, x)),
    then: grokStmt(src, getChildren(x, "Stmt")[0]),
    else: grokStmt(src, getChildren(x, "Stmt")[1]),
  }),
  Block: (src, x) => ({
    body: getChildren(x, "Stmt").map(x => grokStmt(src, x)),
  }),
  VarDecl: (src, x) => ({
    isConstant: hasChild(x, "const"),
    name: getChildText(src, x, "Ident"),
    type: getChild(x, "Type"),
    init: grokExpr(src, getChild(x, "Expr")),
  }),
  While: (src, x) => ({
    test: grokExpr(src, getChild(x, "Expr")),
    payload: getChildren(x, "Ident").map(x => getText(src, x)),
    action: getChild(x, "Assignment") && binopGrok(src, getChild(x, "Assignment")),
    body: grokStmt(src, getChild(x, "Stmt")),
  }),
})

let grokExpr = grokOneOf({
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
  
  Return: (src, x) => ({
    value: grokExpr(src, getChild(x, "Expr")),
  }),

  Try: (src, x) => ({
    body: grokExpr(src, getChild(x, "Expr")),
  }),

  OrElse: (src, x) => ({
    optional: grokExpr(src, getChild(x, "Expr")),
    handler: grokExpr(src, getChild(x, "Expr", { after: "orelse" }))
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
  PlusAssign: binopGrok,
  MinusAssign: binopGrok,

  ForceField: (src, x) => ({
    value: grokExpr(src, getChild(x, "Exp1")),
  }),

  Call: (src, x) => ({
    callee: grokExpr(src, getChild(x, "Exp1")),
    args: getChildren(x, "Expr").map(y => grokExpr(src, y)),
  }),

  CallBuiltin: (src, x) => ({
    callee: getChildText(src, x, "AtId"),
    args: getChildren(x, "Expr").map(y => grokExpr(src, y)),
  }),

  FieldAccess: (src, x) => ({
    thing: grokExpr(src, getChild(x, "Exp1")),
    field: getChildText(src, x, "Ident"),
  }),

  Prim: (src, x) => ({
    name: getText(src, x),
  }),

  Struct: (src, x) => grokContainer(src, x),

  Pointer: (src, x) => ({
    isConstant: hasChild(x, "const"),
    type: grokExpr(src, getChild(x, "Exp1")),
  }),

  Optional: (src, x) => ({
    type: grokExpr(src, getChild(x, "Exp1")),
  }),

  Instantiation: (src, x) => ({
    type: grokExpr(src, getChild(x, "Exp1")),
    fields: getChildren(x, "FieldInit").map(y => ({
      name: getChildText(src, y, "Ident"),
      init: grokExpr(src, getChild(y, "Expr")),
    })),
  }),
})

let grouping = (s, fn, show) => {
  if (show === false)
    console.groupCollapsed(s)
  else
    console.group(s)
  try {
    let x = fn.call()
    return x
  } finally {
    console.groupEnd()
  }
}

let grokDecl = grokOneOf({
  Test: (src, x) => ({
    name: getChildText(src, x, "String").slice(1, -1),
    body: getChildren(getChild(x, "Block"), "Stmt").map(
      y => grokStmt(src, y))
  }),
  
  VarDecl: (src, x) => ({
    isPublic: hasChild(x, "pub"),
    isConstant: hasChild(x, "const"),
    name: getChildText(src, x, "Ident"),
    type: getChild(x, "Type"),
    init: grokExpr(src, getChild(x, "Expr")),
  }),

  FnDecl: (src, x) => ({
    isPublic: hasChild(x, "pub"),
    name: getChildText(src, x, "Ident"),
    returnType: grokExpr(src, getChild(x, "Exp1")),
    params: getChildren(x, "ParamDecl").map(y => ({
      isComptime: hasChild(y, "comptime"),
      name: getChildText(src, y, "Ident"),
      type: grokExpr(src, getChild(y, "AnyType") || getChild(y, "Expr")),
    })),
    body: getChildren(getChild(x, "Block"), "Stmt").map(
      y => grokStmt(src, y))
  }),

  FieldDecl: (src, x) => ({
    name: getChildText(src, x, "Ident"),
    type: grokExpr(src, getChildren(x, "Expr")[0]),
    init: getChildren(x, "Expr")[1] ? grokExpr(src, getChildren(x, "Expr")[1]) : null,
  }),
})

let newMapFromValues = xs => new Map(xs.map(x => [x.name, x]))

let grokContainer = (src, node) =>
  grouping(`groking container ${node.name}`, () => ({
    decls: newMapFromValues(getChildren(node, "Decl").map(x => grokDecl(src, x)))
  }))

export let grokFile = grokContainer

export let initContainer = container => {
  return {
    kind: "instance",
    type: container,
    fields: new Map,
  }
}

let fail = x => { debugger; throw new Error(x) }

class ZigReturn {
  value
  
  constructor(value) {
    this.value = value
  }
}

class ZigReturnError {
  value
  
  constructor(value) {
    this.value = value
  }
}

let checkArity = (arity, args) => {
  if (arity === args.length)
    return args
  else
    fail(`bad arity ${arity} != ${args.length}`)
}

let newMap = o => new Map(Object.entries(o))

let nativeImports = new Map

let zigVoidValue = Symbol("void")
let zigNullValue = Symbol("null")

nativeImports.set("std.zig", {
  kind: "type",
  value: {
    type: "struct",
    decls: newMap({
      testing: {
        kind: "instance",
        fields: new Map,
        type: {
          type: "struct",
          decls: newMap({
            expect: {
              kind: "primop",
              isPublic: true,
              name: "testing",
              returnType: {
                kind: "error-union",
                good: "void",
                bad: undefined,
              },
              params: [{
                isComptime: false,
                name: "ok",
                type: "bool",
              }],
              fn: (ctx, stack, args) => {
                if (args[0].value === false) {
                  throw ZigReturnError("TestUnexpectedResult")
                } else {
                  console.warn(args)
                  return zigVoidValue
                }
              },
            },
          }),
        },
      },
    }),
  },
})

let builtins = {
  "@import": (ctx, stack, args) => {
    let [x] = checkArity(1, args)
    let ptr = evalExpr(ctx, stack, x)

    if (ptr.kind === "pointer"
        && ptr.targetType.kind === "array"
        && ptr.targetType.length) {
      let path = (new TextDecoder).decode(ptr.target.slice(0, -1))
      if (nativeImports.has(path)) {
        let type = nativeImports.get(path)
        return newInstance(ctx, stack, type, new Map)
      } else {
        fail(`@import("${path}")`)
      }
    } else {
      fail(`can only import constant strings`)
    }
  },
}

let newInstance = (ctx, stack, type, fields) => {
  if (type.kind !== "type")
    fail(type.kind)

  for (let decl of type.value.decls.values()) {
    if (decl.kind === "FieldDecl") {
      if (!fields.has(decl.name)) {
        if (decl.init) {
          fields.set(decl.name, evalExpr(ctx, stack, decl.init))
        } else {
          fail("no field init")
        }
      }
    }
  }
  
  return {
    kind: "instance",
    type: type.value,
    fields,
  }
}

let findFieldOrFnInInstance = (x, field) => {
  if (field === "next") debugger
  
  let y
  if (x.fields.has(field)) {
    y = x.fields.get(field)
  } else if (x.type.decls.has(field)) {
    y = x.type.decls.get(field)
  } else {
    fail(`no field or decl ${field}`)
  }

  if (y.kind === "FnDecl") {
    return {
      kind: "bound-function",
      decl: y,
      self: x,
    }
  } else {
    return y
  }
}

let Expr = {
  null: () => zigNullValue,

  AddressOf: (ctx, stack, expr) => {
    if (expr.value.kind === "Ident") {
      let name = expr.value.value
      for (let scope of stack) {
        if (scope.has(name)) {
          return {
            kind: "pointer",
            isConstant: undefined, // XXX
            targetType: undefined, // XXX
            place: {
              kind: "scope",
              scope,
              name,
            },
          }
        }
      }

      fail("didn't find thing in stack")
    }
  },
  
  Number: (ctx, stack, expr) => {
    return {
      kind: "number",
      value: +expr.value,
    }
  },
  
  Equals: (ctx, stack, expr) => {
    let x = evalExpr(ctx, stack, expr.lhs)
    let y = evalExpr(ctx, stack, expr.rhs)

    if (x.kind === "number" && y.kind === "number") {
      return {
        kind: "boolean",
        truth: x.value === y.value,
      }
    } else {
      fail(`we don't take kindly to ${x.kind} around here`)
    }
  },

  Plus: (ctx, stack, expr) => {
    let x = evalExpr(ctx, stack, expr.lhs)
    let y = evalExpr(ctx, stack, expr.rhs)

    debugger
  },

  OrElse: (ctx, stack, expr) => {
    // XXX: optionals need to be actually wrapped, not just nullable
    let x = evalExpr(ctx, stack, expr.optional)
    if (x === zigNullValue)
      return evalExpr(ctx, stack, expr.handler)
    else
      return x
  },

  PlusAssign: (ctx, stack, stmt) => {
    let d = evalExpr(ctx, stack, stmt.rhs)
    if (d.kind == "number") {
      let { setter, value } = evalAssignment(ctx, stack, stmt.lhs)
      if (value.kind == "number") {
        let result = {
          kind: "number",
          value: value.value + d.value
        }
        setter.call(null, result)
        return result
      } else {
        fail(value.kind)
      }
    } else {
      fail(d.kind)
    }
  },
  
  CallBuiltin: (ctx, stack, expr) => {
    let { callee, args } = expr
    if (builtins[callee])
      return builtins[callee].call(null, ctx, stack, args)
    else
      fail(callee)
  },
  
  Call: (ctx, stack, expr) => {
    let thing = evalExpr(ctx, stack, expr.callee)
    let fn
    let self
    
    if (thing.kind === "bound-function") {
      fn = thing.decl
      self = thing.self
    } else {
      fn = thing
    }

    let expectedArgCount = fn.params.length - (self ? 1 : 0)
    
    if (expectedArgCount === expr.args.length) {
      let args = expr.args.map(x => evalExpr(ctx, stack, x))
      
      if (self)
        args.unshift(self)
      
      let scope = new Map(fn.params.map((p, i) =>
        [p.name, {
          kind: "VarDecl",
          isConstant: "true",
          value: args[i],
        }]
      ))
      
      try {
        if (fn.kind === "primop") {
          return fn.fn.call(null, ctx, [scope, ...stack], args)
        } else if (fn.kind === "FnDecl") {
          return evalBlock(ctx, [scope, ...stack], fn.body)
        } else {
          fail(fn.kind)
        }
      } catch (e) {
        if (e instanceof ZigReturn) {
          return e.value
        } else {
          throw e
        }
      }
    } else {
      fail(`bad args`)
    }
  },

  Ident: (ctx, stack, expr) => {
    let name = expr.value
    let x = ctx.fields.get(name)
    
    if (x === undefined)
      for (let scope of stack)
        if (scope.has(name))
          x = scope.get(name)

    if (x === undefined)
      if (ctx.type.decls.has(name))
        x = ctx.type.decls.get(name)
    
    if (x === undefined)
      fail(`unbound ${name}`)

    if (x.kind === "VarDecl" || x.kind === "FieldDecl") {
      if (x.value === undefined) {
        if (x.init) {
          x.value = evalExpr(ctx, stack, x.init)
          return x.value
        } else {
          fail(`accessing undefined variable ${name}`)
        }
      } else {
        return x.value
      }
    } else {
      return x
    }
  },

  String: (ctx, stack, expr) => {
    let array = (new TextEncoder).encode(expr.value)
    let arrayWithSentinel = new Uint8Array(array.length + 1)
    arrayWithSentinel.set(array)
    arrayWithSentinel[array.length] = 0
    
    return {
      kind: "pointer",
      isConstant: true,
      targetType: {
        kind: "array",
        targetType: "u8",
        sentinel: {
          kind: "number",
          type: "u8",
          value: 0,
        },
        length: array.length,
      },
      target: arrayWithSentinel,
    }
  },

  Prim: (ctx, stack, expr) => {
    return {
      kind: "type",
      value: expr.name,
    }
  },

  Struct: (ctx, stack, expr) => {
    return {
      kind: "type",
      value: expr,
    }
  },

  Instantiation: (ctx, stack, expr) => {
    let type = evalExpr(ctx, stack, expr.type)
    let scope = new Map

    for (let x of expr.fields) {
      scope.set(x.name, evalExpr(ctx, stack, x.init))
    }
    
    return newInstance(ctx, stack, type, scope)
  },

  Try: (ctx, stack, expr) => {
    try {
      return evalExpr(ctx, stack, expr.body)
    } catch (e) {
      if (e instanceof ZigReturnError) {
        return {
          kind: "error",
          error: e.value,
        }
      } else {
        console.error(e)
        throw e
      }
    }
  },

  FieldAccess: (ctx, stack, expr) => {
    let { thing, field } = expr
    let x = evalExpr(ctx, stack, thing)
    if (x.kind === "instance") {
      return findFieldOrFnInInstance(x, field)
    } else if (x.kind === "type") {
      if (x.value.kind === "Struct") {
        let decl = x.value.decls.get(field)
        if (decl) {
          if (decl.kind === "VarDecl") {
            if (decl.value) {
              return decl.value
            } else if (decl.init) {
              decl.value = evalExpr(
                "bogus-ctx", "bogus-scopes", decl.init)
              return decl.value
            } else {
              fail(`accessing undefined member ${name}`)
            }
          }
        } else {
          fail(`no ${field} in struct`)
        }
      } else {
        fail(x.value.kind)
      }
    } else if (x.kind == "pointer") {
      if (x.place.kind == "scope") {
        let target = x.place.scope.get(x.place.name)
        if (target.kind == "VarDecl" && target.value) {
          if (target.value.kind == "instance") {
            return findFieldOrFnInInstance(target.value, field)
          } else {
            debugger
          }
        } else {
          debugger
        }
      } else {
        fail(x.place.kind)
      }
    } else {
      fail("expected container")
    }
  },

  Return: (ctx, stack, expr) => {
    let x = evalExpr(ctx, stack, expr.value)
    throw new ZigReturn(x)
  },
}

// XXX lol this should just make a pointer
let evalAssignment = (ctx, stack, lhs) => {
  if (lhs.kind == "FieldAccess") {
    let x = evalExpr(ctx, stack, lhs.thing)
    if (x.kind == "pointer") {
      if (x.place.kind == "scope") {
        let place = x.place.scope.get(x.place.name)
        if (place.kind == "VarDecl") {
          if (place.isConstant) {
            fail("constant")
          } else {
            if (place.value.kind == "instance") {
              if (place.value.fields.has(lhs.field)) {
                return {
                  setter: y => place.value.fields.set(lhs.field, y),
                  value: place.value.fields.get(lhs.field),
                }
              } else {
                fail(lhs.field)
              }
            } else {
              fail(place.value.kind)
            }
          }
        } else {
          fail(place.kind)
        }
      } else {
        fail(x.place.kind)
      }
    } else if (x.kind == "instance") {
      if (x.fields.has(lhs.field)) {
        return {
          setter: y => x.fields.set(lhs.field, y),
          value: x.fields.get(lhs.field),
        }
      } else {
        fail(lhs.field)
      }
    } else {
      fail(x.kind)
    }
  } else if (lhs.kind == "Ident") {
    for (let scope of stack) {
      if (scope.has(lhs.value)) {
        return {
          setter: y => {
            scope.get(lhs.value).value = y
          },
          value: scope.get(lhs.value).value,
        }
      }
    }
    debugger
  } else {
    fail(lhs.kind)
  }
}

let Stmt = {
  Assignment: (ctx, stack, stmt) => {
    let { setter } = evalAssignment(ctx, stack, stmt.lhs)
    setter.call(null, evalExpr(ctx, stack, stmt.rhs))
  },
  
  VarDecl: (ctx, stack, stmt) => {
    let { name, isConstant, init } = stmt
    
    if (ctx.fields.has(name))
      fail(`shadowing ${name}`)
    
    for (let scope of stack)
      if (scope.has(name))
        fail(`shadowing ${name}`)
    
    stack[0].set(stmt.name, {
      kind: "VarDecl",
      isConstant: stmt.isConstant,
      value: evalExpr(ctx, stack, stmt.init),
    })
  },

  Expr: (ctx, stack, stmt) => {
    return evalExpr(ctx, stack, stmt.expr)
  },

  Block: (ctx, stack, stmt) => {
    for (let x of stmt.body) {
      evalStmt(ctx, stack, x)
    }
  },

  If: (ctx, stack, stmt) => {
    let condition = evalExpr(ctx, stack, stmt.test)

    if (stmt.payload) {
      if (stmt.payload.length !== 1)
        fail("too many if payloads")

      if (condition === zigNullValue) {
        if (stmt.else)
          return evalStmt(ctx, stack, stmt.else)
        else
          return zigVoidValue
      } else {
        let [name] = stmt.payload
        let newStack = [
          new Map([[name, {
            kind: "VarDecl",
            isConstant: true,
            value: condition,
          }]]),
          ...stack,
        ]

        return evalStmt(ctx, newStack, stmt.then)
      }
    } else {
      if (condition.kind === "bool") {
        if (condition.truth) {
          return evalStmt(ctx, stack, stmt.then)
        } else if (stmt.else) {
          return evalStmt(ctx, stack, stmt.else)
        } else {
          return zigVoidValue
        }
      } else {
        fail("condition not a bool")
      }
    }
  },

  While: (ctx, stack, stmt) => {
    let i = 20
    console.group("while")
    while (i--) {
      let condition = evalExpr(ctx, stack, stmt.test)

      if (stmt.payload) {
        if (stmt.payload.length !== 1)
          fail("too many if payloads")

        if (condition === zigNullValue) {
          return zigVoidValue
        } else {
          let [name] = stmt.payload
          let newStack = [
            new Map([[name, {
              kind: "VarDecl",
              isConstant: true,
              value: condition,
            }]]),
            ...stack,
          ]

          evalStmt(ctx, newStack, stmt.body)

          if (stmt.action) {
            debugger
            let { setter } = evalAssignment(ctx, newStack, stmt.action.lhs)
            setter.call(null, evalExpr(ctx, newStack, stmt.action.rhs))
          }
        }
      } else {
        if (condition.kind === "bool") {
          if (condition.truth) {
            evalStmt(ctx, stack, stmt.body)
            if (stmt.action) {
              let { setter } = evalAssignment(ctx, stack, stmt.action)
              setter.call(null, evalExpr(ctx, stack, stmt.action.rhs))
            }
          } else {
            return zigVoidValue
          }
        } else {
          fail("condition not a bool")
        }
      }
    }

    console.groupEnd()
    debugger
  },
}

let evalExpr = (ctx, stack, expr) => {
  return grouping(`eval ${expr.kind}`, () => {
    console.log("expr", expr)
    console.log(expr.src)
    let f = Expr[expr.kind]
    if (!f) throw new Error(`no expr ${expr.kind}`)
    return f.call(null, ctx, stack, expr)
  })
}

let evalStmt = (ctx, stack, stmt) => {
  return grouping(`eval ${stmt.kind}`, () => {
    console.log("stmt", stmt)
    console.log(stmt.src)
    let f = Stmt[stmt.kind]
    if (!f) throw new Error(`no stmt ${stmt.kind}`)
    f.call(null, ctx, stack, stmt)
  })
}

let evalBlock = (ctx, stack, block) => {
  return grouping("eval block", () => {
    for (let stmt of block)
      evalStmt(ctx, stack, stmt)
  })
}

let evalTest = (ctx, test) => {
  return grouping(`test ${test.name}`, () => {
    console.log(test)
    evalBlock(ctx, [new Map], test.body)
  })
}

export let evalTests = (ctx, filter = () => true) => {
  return grouping("tests", () => {
    console.log(ctx)
    
    for (let name of ctx.type.decls.keys()) {
      let { kind } = test = ctx.type.decls.get(name)
      if (kind == "Test") {
        if (filter.call(null, name))
          evalTest(ctx, test)
        else
          console.info("skipping", name)
      }
    }
  })
}
