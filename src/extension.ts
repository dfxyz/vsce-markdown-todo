import * as vscode from "vscode";

type KeywordConfig = {
  keyword: string;
  color?: string | null;
  backgroundColor?: string | null;
  bold?: boolean;
};

const LINE_REGEX = /^((#{1,6}|\s*[-+*])\s+)(.*)$/;
const DEFAULT_KEYWORD_CONFIGS: KeywordConfig[] = [
  {
    keyword: "TODO",
    color: "#C05430",
    backgroundColor: null,
    bold: true,
  },
  {
    keyword: "DONE",
    color: "#008020",
    backgroundColor: null,
    bold: true,
  },
];

const KEYWORD_CONFIGS: KeywordConfig[] = [];
const DECORATION_MAP: Map<string, vscode.TextEditorDecorationType> = new Map();
let DECORATE_REGEX: RegExp | null = null;
let DECORATED_EDITORS = new WeakSet<vscode.TextEditor>(); // rebuild on visible text editor change

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      handleConfigurationChange(event);
    }),
  );
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

  loadConfigurationAndUpdateDecoration();
}

export function deactivate() {}

function loadConfigurationAndUpdateDecoration() {
  const configuration = vscode.workspace.getConfiguration("markdown-todo");
  const keywordConfigs = configuration.get<KeywordConfig[]>("keywords") ??
    DEFAULT_KEYWORD_CONFIGS;
  if (keywordConfigs.length <= 0) {
    vscode.window.showErrorMessage("Markdown TODO: no keyword configured.");
    return;
  }

  const keywordSet = new Set();
  for (const item of keywordConfigs) {
    item.keyword = item.keyword.trim();
    item.color = item.color ?? null;
    item.backgroundColor = item.backgroundColor ?? null;
    item.bold = item.bold ?? true;

    if (item.keyword.length <= 0) {
      vscode.window.showErrorMessage(
        "Markdown TODO: one of the keywords is empty or whitespace.",
      );
      return;
    }
    if (keywordSet.has(item.keyword)) {
      vscode.window.showErrorMessage(
        "Markdown TODO: one of the keywords is duplicated.",
      );
    }
    keywordSet.add(item.keyword);
  }
  KEYWORD_CONFIGS.splice(0, KEYWORD_CONFIGS.length);
  KEYWORD_CONFIGS.push(...keywordConfigs);

  for (const oldDecoration of DECORATION_MAP.values()) {
    oldDecoration.dispose();
  }
  DECORATION_MAP.clear();
  for (const config of KEYWORD_CONFIGS) {
    const options: vscode.DecorationRenderOptions = {};
    if (config.color !== null) {
      options.color = config.color;
    }
    if (config.backgroundColor !== null) {
      options.backgroundColor = config.backgroundColor;
    }
    if (config.bold) {
      options.fontWeight = "bold";
    }
    DECORATION_MAP.set(
      config.keyword,
      vscode.window.createTextEditorDecorationType(options),
    );
  }

  const regexString = "^((#{1,6}|\\s*[-+*])\\s+)(" +
    KEYWORD_CONFIGS.map((item) => {
      // escape regex special characters
      return item.keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }).join("|") + ")\\s+.*$";
  DECORATE_REGEX = new RegExp(regexString);

  for (const editor of vscode.window.visibleTextEditors) {
    updateDecoration(editor);
  }
}

function hasValidConfiguration(): boolean {
  return KEYWORD_CONFIGS.length > 0;
}

function handleConfigurationChange(event: vscode.ConfigurationChangeEvent) {
  if (event.affectsConfiguration("markdown-todo.keywords")) {
    loadConfigurationAndUpdateDecoration();
  }
}

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

  if (!hasValidConfiguration()) {
    vscode.window.showErrorMessage(
      "Markdown TODO is not initialized properly.",
    );
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

  const todoKeywords = KEYWORD_CONFIGS.map((item) => item.keyword);
  let remainingTextPart = textPart.trim();
  let currentKeywordIndex = cycleForward ? -1 : todoKeywords.length;
  for (const [i, v] of Object.entries(todoKeywords)) {
    if (textPart.startsWith(v + " ")) {
      currentKeywordIndex = Number(i);
      remainingTextPart = textPart.slice(v.length).trim();
      break;
    }
  }
  const nextKeywordIndex = currentKeywordIndex += cycleForward ? 1 : -1;
  let keywordPart = todoKeywords[nextKeywordIndex] ?? "";
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

function updateDecorationOnDocumentTextChange(
  event: vscode.TextDocumentChangeEvent,
) {
  if (!hasValidConfiguration()) {
    return;
  }
  for (const editor of vscode.window.visibleTextEditors) {
    if (editor.document === event.document) {
      updateDecoration(editor);
    }
  }
}

function updateDecorationOnVisibleTextEditorChange(
  editors: readonly vscode.TextEditor[],
) {
  if (!hasValidConfiguration()) {
    return;
  }

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

  const keyword2ranges = new Map();
  const lineCount = editor.document.lineCount;
  for (let lineNumber = 0; lineNumber < lineCount; lineNumber++) {
    const line = editor.document.lineAt(lineNumber).text;

    let match = line.match(DECORATE_REGEX!);
    if (match === null) {
      continue;
    }

    const startCount = match[1].length;
    const keyword = match[3];
    let ranges = keyword2ranges.get(keyword);
    if (ranges === undefined) {
      ranges = [];
      keyword2ranges.set(keyword, ranges);
    }
    ranges.push(
      new vscode.Range(
        new vscode.Position(lineNumber, startCount),
        new vscode.Position(lineNumber, startCount + keyword.length),
      ),
    );
  }

  for (const [keyword, decoration] of DECORATION_MAP) {
    const ranges = keyword2ranges.get(keyword) ?? [];
    editor.setDecorations(decoration, ranges);
  }
  DECORATED_EDITORS.add(editor);
}
