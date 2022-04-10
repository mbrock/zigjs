import { evalFile } from "./eval.js"
import { parser } from "./dist/zig.js"

import { EditorState, EditorView, basicSetup } from "@codemirror/basic-setup"
import { LRLanguage, LanguageSupport, syntaxTree, foldNodeProp, foldInside } from "@codemirror/language"
import { linter } from "@codemirror/lint"
import { styleTags, tags as t } from "@codemirror/highlight"
import { hoverTooltip } from "@codemirror/tooltip"
import { Decoration, keymap } from "@codemirror/view"
import { EditorSelection, StateField, StateEffect } from "@codemirror/state"
import { oneDark } from "@codemirror/theme-one-dark"

import example from "./std/linked_list.zig"
import example2 from "./std/demo.zig"

function nodeTypeDecoration(view) {
  let widgets = []
  for (let {from, to} of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from, to,
      enter: (type, from, to) => {
        if (type.name == "BooleanLiteral") {
          let isTrue = view.state.doc.sliceString(from, to) == "true"
          let deco = Decoration.widget({
            widget: new CheckboxWidget(isTrue),
            side: 1
          })
          widgets.push(deco.range(to))
        }
      }
    })
  }
  return Decoration.set(widgets)
}

export const nodeTypeTooltip = hoverTooltip((view, pos, side) => {
  const node = syntaxTree(view.state).resolve(pos)
  return {
    pos,
    end: node.to,
    above: true,
    create(view) {
      let dom = document.createElement("div")
      dom.textContent = node.name
      return {dom}
    }
  }
})

function underlineNode(view) {
  let tree = syntaxTree(view.state)
  let node = tree.resolve(view.state.selection.main.from)
  view.dispatch({
    selection: EditorSelection.single(node.from, node.to)
  })
  return true
}

function zigLint(view){
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

let view = new EditorView({
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
                AtIdent: t.standard(t.function(t.name)),
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

console.log(
  evalFile(
    example,
    parser.configure({ strict: true }).parse(example)
  )
)
