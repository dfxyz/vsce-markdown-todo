import * as vscode from "vscode";

const TODO_KEYWORDS = ["TODO", "DONE"];
const LINE_REGEX = /^((#{1,6}|\s*[-+*])\s+)(.*)$/;
const DECORATE_LINE_REGEX = /^((#{1,6}|\s*[-+*])\s+)(TODO|DONE)\s+.*$/;

const TODO_DECORATION = vscode.window.createTextEditorDecorationType({
  color: "#C05430",
  fontWeight: "bold",
});
const DONE_DECORATION = vscode.window.createTextEditorDecorationType({
  color: "#008020",
  fontWeight: "bold",
});

let DECORATED_EDITORS = new WeakSet<vscode.TextEditor>();

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "markdown-todo.cycleTodoState",
      cycleTodoState,
    ),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "markdown-todo.cycleTodoStateBackward",
      () => cycleTodoState(false),
    ),
  );

  initDecoration();
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      updateDecorationOnDocumentTextChange(event);
    }),
  );
  context.subscriptions.push(
    vscode.window.onDidChangeVisibleTextEditors((editors) => {
      updateDecorationOnVisibleTextEditorChange(editors);
    }),
  );
}

export function deactivate() {}

function cycleTodoState(cycleForward = true) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage("No active text editor.");
    return;
  }

  const document = editor.document;
  if (document.languageId !== "markdown") {
    vscode.window.showErrorMessage("Only supported in markdown files.");
    return;
  }

  const line = editor.document.lineAt(editor.selection.active.line);
  const text = line.text;

  const match = text.match(LINE_REGEX);
  if (match === null) {
    vscode.window.showErrorMessage("Not supported in current context.");
    return;
  }
  const punctPart = match[2] + " ";
  const textPart = match[3];

  let remainingTextPart = textPart.trim();
  let currentKeywordIndex = cycleForward ? -1 : TODO_KEYWORDS.length;
  for (const [i, v] of Object.entries(TODO_KEYWORDS)) {
    if (textPart.startsWith(v + " ")) {
      currentKeywordIndex = Number(i);
      remainingTextPart = textPart.slice(v.length).trim();
      break;
    }
  }
  const nextKeywordIndex = currentKeywordIndex += cycleForward ? 1 : -1;
  let keywordPart = TODO_KEYWORDS[nextKeywordIndex] ?? "";
  if (keywordPart !== "") {
    keywordPart += " ";
  }

  const newLine = `${punctPart}${keywordPart}${remainingTextPart}`;
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

function initDecoration() {
  for (const editor of vscode.window.visibleTextEditors) {
    updateDecoration(editor);
  }
}

function updateDecorationOnDocumentTextChange(
  event: vscode.TextDocumentChangeEvent,
) {
  for (const editor of vscode.window.visibleTextEditors) {
    if (editor.document === event.document) {
      updateDecoration(editor);
    }
  }
}

function updateDecorationOnVisibleTextEditorChange(
  editors: readonly vscode.TextEditor[],
) {
  const newDecoratedSet = new WeakSet();
  const notDecoratedEditors = [];

  for (const editor of editors) {
    if (DECORATED_EDITORS.has(editor)) {
      newDecoratedSet.add(editor);
    } else {
      notDecoratedEditors.push(editor);
    }
  }
  DECORATED_EDITORS = newDecoratedSet;

  for (const editor of notDecoratedEditors) {
    updateDecoration(editor);
  }
}

function updateDecoration(editor: vscode.TextEditor) {
  if (editor.document.languageId !== "markdown") {
    return;
  }
  const todoDecorations = [];
  const doneDecorations = [];

  const lineCount = editor.document.lineCount;
  for (let lineNumber = 0; lineNumber < lineCount; lineNumber++) {
    const line = editor.document.lineAt(lineNumber).text;

    let match = line.match(DECORATE_LINE_REGEX);
    if (match === null) {
      continue;
    }

    const startCount = match[1].length;
    const keyword = match[3];
    if (keyword === "TODO") {
      todoDecorations.push(
        new vscode.Range(
          new vscode.Position(lineNumber, startCount),
          new vscode.Position(lineNumber, startCount + keyword.length),
        ),
      );
    } else {
      doneDecorations.push(
        new vscode.Range(
          new vscode.Position(lineNumber, startCount),
          new vscode.Position(lineNumber, startCount + keyword.length),
        ),
      );
    }
  }

  editor.setDecorations(TODO_DECORATION, todoDecorations);
  editor.setDecorations(DONE_DECORATION, doneDecorations);

  DECORATED_EDITORS.add(editor);
}
