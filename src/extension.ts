import * as vscode from "vscode";

const TODO_KEYWORDS = ["TODO", "DONE"];
const LINE_REGEX = /^((#{1,6}|\s*[-+*])\s+)(.*)$/;

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
