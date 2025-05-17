// noinspection JSUnusedGlobalSymbols

import * as vscode from 'vscode';
import {
  COMMAND_CYCLE_TODO_STATE,
  COMMAND_CYCLE_TODO_STATE_BACKWARD,
  CONFIG_SECTION,
  CYCLABLE_LINE_REGEX,
  EXTENSION_NAME,
} from './constants';
import { DocumentInfo, KeywordConfiguration } from './utils';

let defaultKeywordConfiguration: KeywordConfiguration;
const documentInfoMap = new WeakMap<vscode.TextDocument, DocumentInfo>();
const decoratedEditors = new WeakSet<vscode.TextEditor>();

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_CYCLE_TODO_STATE, () => {
      cycleTodoState(true);
    }),
    vscode.commands.registerCommand(COMMAND_CYCLE_TODO_STATE_BACKWARD, () => {
      cycleTodoState(false);
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      onConfigurationChanged(event);
    }),
    vscode.workspace.onDidOpenTextDocument((doc) => {
      onOpenTextDocument(doc);
    }),
    vscode.workspace.onDidCloseTextDocument((doc) => {
      onCloseTextDocument(doc);
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      onTextDocumentChanged(event);
    }),
    vscode.window.onDidChangeVisibleTextEditors((editors) => {
      onVisibleTextEditorsChanged(editors);
    }),
  );

  defaultKeywordConfiguration = KeywordConfiguration.loadFromWorkspace();
  for (const doc of vscode.workspace.textDocuments) {
    onOpenTextDocument(doc);
  }
}

export function deactivate() {
  // do nothing
}

/**
 * If the cursor line of the active editor is a markdown heading or unordered list item,
 * cycle the TODO state of it.
 * @param cycleForward The direction to cycling.
 */
function cycleTodoState(cycleForward: boolean) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    // noinspection JSIgnoredPromiseFromCall
    vscode.window.showWarningMessage(`${EXTENSION_NAME}: no active text editor.`);
    return;
  }
  const doc = editor.document;
  const docInfo = documentInfoMap.get(doc);
  if (docInfo === undefined) {
    // noinspection JSIgnoredPromiseFromCall
    vscode.window.showWarningMessage(`${EXTENSION_NAME}: not a markdown document.`);
    return;
  }
  const keywords = docInfo.keywordConfiguration.keywords;
  const cursorLineNumber = editor.selection.active.line;
  const cursorLineText = doc.lineAt(cursorLineNumber).text;
  const match = cursorLineText.match(CYCLABLE_LINE_REGEX);
  if (!match) {
    // noinspection JSIgnoredPromiseFromCall
    vscode.window.showWarningMessage(`${EXTENSION_NAME}: not supported in current line.`);
    return;
  }
  const punctuationPart = match[2] + ' ';
  let textPart = match[3];
  let index: number | undefined;
  for (const [i, v] of keywords.entries()) {
    if (textPart.startsWith(v + ' ')) {
      index = i;
      textPart = textPart.slice(v.length + 1).trim();
      break;
    }
  }
  if (index === undefined) {
    index = cycleForward ? 0 : keywords.length - 1;
  } else {
    index += cycleForward ? 1 : -1;
  }
  let keywordPart = keywords[index] ?? '';
  if (keywordPart !== '') {
    keywordPart += ' ';
  }
  const newLineText = `${punctuationPart}${keywordPart}${textPart}`;
  // noinspection JSIgnoredPromiseFromCall
  editor.edit((editBuilder) => {
    editBuilder.replace(new vscode.Range(cursorLineNumber, 0, cursorLineNumber, cursorLineText.length), newLineText);
  });
}

function onConfigurationChanged(event: vscode.ConfigurationChangeEvent) {
  if (!event.affectsConfiguration(CONFIG_SECTION)) {
    return;
  }
  const keywordConfiguration = KeywordConfiguration.loadFromWorkspace();
  if (!keywordConfiguration.equals(defaultKeywordConfiguration)) {
    const oldDefaultConfiguration = defaultKeywordConfiguration;
    oldDefaultConfiguration.dispose();
    defaultKeywordConfiguration = keywordConfiguration;
    for (const doc of vscode.workspace.textDocuments) {
      const docInfo = documentInfoMap.get(doc);
      if (docInfo === undefined || docInfo.keywordConfiguration === oldDefaultConfiguration) {
        onOpenTextDocument(doc);
      }
    }
  }
}

function onOpenTextDocument(doc: vscode.TextDocument) {
  if (doc.languageId !== 'markdown') {
    return;
  }
  const docInfo = new DocumentInfo(doc, defaultKeywordConfiguration);
  documentInfoMap.set(doc, docInfo);
  for (const editor of vscode.window.visibleTextEditors) {
    if (editor.document === doc) {
      docInfo.decorateEditor(editor);
      decoratedEditors.add(editor);
    }
  }
}

function onCloseTextDocument(doc: vscode.TextDocument) {
  if (doc.languageId !== 'markdown') {
    return;
  }
  const docInfo = documentInfoMap.get(doc);
  if (!docInfo) {
    return;
  }
  documentInfoMap.delete(doc);
  for (const editor of vscode.window.visibleTextEditors) {
    if (editor.document === doc) {
      docInfo.undecorateEditor(editor);
      decoratedEditors.delete(editor);
    }
  }
  if (docInfo.keywordConfiguration !== defaultKeywordConfiguration) {
    docInfo.keywordConfiguration.dispose();
  }
}

function onTextDocumentChanged(event: vscode.TextDocumentChangeEvent) {
  if (event.contentChanges.length <= 0) {
    return;
  }
  const doc = event.document;
  const docInfo = documentInfoMap.get(doc);
  if (docInfo === undefined) {
    return;
  }
  for (const change of event.contentChanges) {
    if (!docInfo.hasMetadata() || docInfo.isMetadataAffected(change)) {
      let { keywordConfiguration } = KeywordConfiguration.loadFromTextDocument(doc);
      if (keywordConfiguration === null) {
        keywordConfiguration = defaultKeywordConfiguration;
      }
      if (!docInfo.keywordConfiguration.equals(keywordConfiguration)) {
        onCloseTextDocument(doc);
        onOpenTextDocument(doc);
        return;
      }
    }
    if (!docInfo.isMainContentAffected(change)) {
      continue;
    }
    docInfo.onDocChange(doc, change);
  }
  for (const editor of vscode.window.visibleTextEditors) {
    if (editor.document === doc) {
      docInfo.decorateEditor(editor);
      decoratedEditors.add(editor);
    }
  }
}

function onVisibleTextEditorsChanged(editors: readonly vscode.TextEditor[]) {
  for (const editor of editors) {
    if (decoratedEditors.has(editor)) {
      continue;
    }
    const docInfo = documentInfoMap.get(editor.document);
    if (docInfo) {
      docInfo.decorateEditor(editor);
      decoratedEditors.add(editor);
    }
  }
}
