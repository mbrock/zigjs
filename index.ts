import { grokFile, Struct } from "./zigeval"
import { parser } from "./dist/zig"

import { EditorState, EditorView, basicSetup } from "@codemirror/basic-setup"
import { LRLanguage, LanguageSupport, syntaxTree, foldNodeProp, foldInside } from "@codemirror/language"
import { linter } from "@codemirror/lint"
import { styleTags, tags as t } from "@codemirror/highlight"
import { hoverTooltip } from "@codemirror/tooltip"
import {  keymap } from "@codemirror/view"
import { EditorSelection } from "@codemirror/state"
import { oneDark } from "@codemirror/theme-one-dark"

import example from "./std/linked_list.zig"

export const nodeTypeTooltip = hoverTooltip((view, pos) => {
  const node = syntaxTree(view.state).resolve(pos)
  return {
    pos,
    end: node.to,
    above: true,
    create(_view: EditorView) {
      let dom = document.createElement("div")
      dom.textContent = node.name
      return {dom}
    }
  }
})

function underlineNode(view: EditorView) {
  let tree = syntaxTree(view.state)
  let node = tree.resolve(view.state.selection.main.from)
  view.dispatch({
    selection: EditorSelection.single(node.from, node.to)
  })
  return true
}

function zigLint(view: EditorView) {
  const diagnostics = []

  syntaxTree(view.state).iterate({
    enter: (type, from, to) => {
      if (type.isError) {
        diagnostics.push({
          from,
          to,
          severity: "error",
          message: "Yep. That's a syntax error.",
        })
      }
    },
  })

  return diagnostics;
}

const underlineKeymap = keymap.of([{
  key: "Mod-.",
  preventDefault: true,
  run: underlineNode,
}])

 new EditorView({
  state: EditorState.create({
    doc: example,
    extensions: [
      underlineKeymap,
      basicSetup,
      EditorView.theme({
        ".cm-scroller, .cm-content, .cm-tooltip": {
          fontFamily: "dm mono, ui-monospace, SFMono-Regular, Menlo, monospace",
          fontWeight: "normal",
        },

        ".cm-tooltip": {
          padding: ".25em .5em",
          borderRadius: ".25em",
          fontWeight: "bold",
          fontSize: "125%",
          background: "black",
          color: "ivory",
        },
      }, {
        dark: true,
      }),
      oneDark,
      new LanguageSupport(
        LRLanguage.define({
          parser: parser.configure({
            props: [
              styleTags({
                Ident: t.name,
                AtId: t.standard(t.function(t.name)),
                String: t.string,
                Comment: t.lineComment,
                "void u32 type": t.standard(t.typeName),
                "( )": t.paren,
                "pub const struct anytype": t.keyword,
                "try return while if else": t.controlKeyword,
                "fn var test comptime": t.definitionKeyword,
                "orelse": t.operatorKeyword,
                "null": t.null,
              }),
              foldNodeProp.add({
                Block: foldInside
              }),
            ],
          })
        })
      ),
      linter(zigLint),
      nodeTypeTooltip,
    ]
  }),
  parent: document.body
})

let mod = grokFile(
  example,
  "linked_list.zig",
  parser.configure({ strict: true }).parse(example).topNode
)

let ctx = new Struct(mod)
ctx.runTests(mod, (x: string) => !!x.match(/Singly/))
