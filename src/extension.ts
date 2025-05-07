import * as vscode from "vscode";

const KEYWORDS = ["TODO", "WIP", "DONE"];
const HEADING_LINE_REGEX = /^(#{1,6})\s+(.*)$/;
const UNSORTED_LIST_REGEX = /^(\s*[-+*])\s+(.*)$/;

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand(
    "markdown-todo.cycleTodoState",
    cycleTodoState,
  );
  context.subscriptions.push(disposable);
}

export function deactivate() {}

function cycleTodoState() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  const document = editor.document;
  if (document.languageId !== "markdown") {
    return;
  }

  const line = editor.document.lineAt(editor.selection.active.line);
  const text = line.text;

  let match = text.match(HEADING_LINE_REGEX);
  if (!match) {
    match = text.match(UNSORTED_LIST_REGEX);
  }
  if (!match) {
    return;
  }
  const prefix = match[1];
  const mainContent = match[2];

  let content = mainContent;
  let keywordIndex = -1;
  for (const [i, v] of Object.entries(KEYWORDS)) {
    if (mainContent.startsWith(`${v} `)) {
      keywordIndex = Number(i);
      content = mainContent.slice(v.length + 1);
      break;
    }
  }
  keywordIndex += 1;
  if (keywordIndex >= KEYWORDS.length) {
    keywordIndex = -1;
  }
  const newKeyword = keywordIndex >= 0 ? `${KEYWORDS[keywordIndex]} ` : '';
  const newLine = `${prefix} ${newKeyword}${content}`;

  editor.edit((editBuilder) => {
    const range = new vscode.Range(
      line.lineNumber,
      0,
      line.lineNumber,
      line.text.length,
    );
    editBuilder.replace(range, newLine);
  });
}
