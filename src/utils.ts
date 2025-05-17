import * as vscode from 'vscode';
import * as yaml from 'yaml';
import lodash from 'lodash';
import { CONFIG_SECTION, CONFIG_SECTION_KEYWORDS } from './constants';

type KeywordConfigurationItem = {
  keyword: string;
  color: string | null;
  backgroundColor: string | null;
  bold: boolean;
};

type DocumentKeywordConfigurationInfo = {
  keywordConfiguration: KeywordConfiguration | null;
  mainContentStartLineNumber: number;
};

export class KeywordConfiguration {
  private static readonly DEFAULT: KeywordConfiguration = new KeywordConfiguration([
    {
      keyword: 'TODO',
      color: '#C05430',
      backgroundColor: null,
      bold: true,
    },
    {
      keyword: 'DONE',
      color: '#008020',
      backgroundColor: null,
      bold: true,
    },
  ]);

  static fromAny(any: any): KeywordConfiguration | null {
    if (!Array.isArray(any)) {
      return null;
    }
    const usedKeywords = new Set();
    const items: KeywordConfigurationItem[] = [];
    for (const item of any) {
      if (item === null || typeof item !== 'object') {
        continue;
      }

      let keyword = item.keyword;
      if (typeof keyword !== 'string') {
        continue;
      }
      keyword = keyword.trim();
      if (keyword.length <= 0 || usedKeywords.has(keyword)) {
        continue;
      }

      let color = item.color;
      if (typeof color !== 'string') {
        color = null;
      }

      let backgroundColor = item.backgroundColor;
      if (typeof backgroundColor !== 'string') {
        backgroundColor = null;
      }

      let bold = item.bold;
      if (typeof bold !== 'boolean') {
        bold = true;
      }

      items.push({
        keyword,
        color,
        backgroundColor,
        bold,
      });
      usedKeywords.add(keyword);
    }
    if (items.length <= 0) {
      return null;
    }
    return new KeywordConfiguration(items);
  }

  static loadFromWorkspace(): KeywordConfiguration {
    const rawItems = vscode.workspace.getConfiguration(CONFIG_SECTION).get('keywords');
    return KeywordConfiguration.fromAny(rawItems) ?? KeywordConfiguration.DEFAULT;
  }

  static loadFromTextDocument(doc: vscode.TextDocument): DocumentKeywordConfigurationInfo {
    const result: DocumentKeywordConfigurationInfo = {
      keywordConfiguration: null,
      mainContentStartLineNumber: 0,
    };
    if (doc.lineCount <= 0) {
      return result;
    }
    const firstLine = doc.lineAt(0).text;
    if (!firstLine.startsWith('---')) {
      return result;
    }
    let metadataLastLineNumber = 1;
    for (; metadataLastLineNumber < doc.lineCount; metadataLastLineNumber += 1) {
      const line = doc.lineAt(metadataLastLineNumber).text;
      if (line.startsWith('---')) {
        break;
      }
    }
    if (metadataLastLineNumber >= doc.lineCount) {
      return result;
    }
    result.mainContentStartLineNumber = metadataLastLineNumber + 1;
    const yamlContent = doc.getText(new vscode.Range(1, 0, metadataLastLineNumber, 0));
    let metadata;
    try {
      metadata = yaml.parse(yamlContent);
    } catch (_) {
      return result;
    }
    if (typeof metadata !== 'object' || metadata === null) {
      return result;
    }
    const configItems = metadata[CONFIG_SECTION_KEYWORDS] ?? metadata[CONFIG_SECTION]?.keywords;
    result.keywordConfiguration = KeywordConfiguration.fromAny(configItems);
    return result;
  }

  private readonly items: KeywordConfigurationItem[];
  readonly keywords: string[];
  readonly decorationTypes: Map<string, vscode.TextEditorDecorationType>;
  readonly decorateLineRegexp: RegExp;

  private constructor(items: KeywordConfigurationItem[]) {
    this.items = items;
    this.keywords = items.map((item) => item.keyword);
    this.decorationTypes = new Map();
    for (const item of this.items) {
      const options: vscode.DecorationRenderOptions = {};
      if (item.color !== null) {
        options.color = item.color;
      }
      if (item.backgroundColor !== null) {
        options.backgroundColor = item.backgroundColor;
      }
      if (item.bold) {
        options.fontWeight = 'bold';
      }
      this.decorationTypes.set(item.keyword, vscode.window.createTextEditorDecorationType(options));
    }
    const escapedKeywords = this.keywords
      .map((kw) => {
        return kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      })
      .join('|');
    this.decorateLineRegexp = new RegExp(`^((#{1,6}|\\s*[-+*])\\s+)(${escapedKeywords})\\s+.*$`);
  }

  equals(that: KeywordConfiguration): boolean {
    if (this === that) {
      return true;
    }
    if (this.items.length !== that.items.length) {
      return false;
    }
    for (let i = 0; i < this.items.length; i++) {
      const thisItem = this.items[i];
      const thatItem = that.items[i];
      if (thisItem.keyword !== thatItem.keyword) {
        return false;
      }
      if (thisItem.color !== thatItem.color) {
        return false;
      }
      if (thisItem.backgroundColor !== thatItem.backgroundColor) {
        return false;
      }
      if (thisItem.bold !== thatItem.bold) {
        return false;
      }
    }
    return true;
  }

  dispose() {
    for (const decorationType of this.decorationTypes.values()) {
      decorationType.dispose();
    }
  }
}

type DecorationLineInfo = {
  lineNumber: number;
  keyword: string;
  range: vscode.Range;
};

export class DocumentInfo {
  readonly keywordConfiguration: KeywordConfiguration;
  private readonly mainContentStartLineNumber;
  private decorationLines: DecorationLineInfo[] = [];

  constructor(doc: vscode.TextDocument, defaultKeywordConfiguration: KeywordConfiguration) {
    let { keywordConfiguration, mainContentStartLineNumber } = KeywordConfiguration.loadFromTextDocument(doc);
    this.keywordConfiguration = keywordConfiguration ?? defaultKeywordConfiguration;
    this.mainContentStartLineNumber = mainContentStartLineNumber;
    const decorateLineRegexp = this.keywordConfiguration.decorateLineRegexp;
    for (let lineNumber = 0; lineNumber < doc.lineCount; lineNumber++) {
      const line = doc.lineAt(lineNumber).text;
      const match = line.match(decorateLineRegexp);
      if (match === null) {
        continue;
      }
      const keyword = match[3];
      const range = new vscode.Range(lineNumber, match[1].length, lineNumber, match[1].length + keyword.length);
      this.decorationLines.push({
        lineNumber,
        keyword,
        range,
      });
    }
  }

  decorateEditor(editor: vscode.TextEditor) {
    const typeRangesMap = new Map<vscode.TextEditorDecorationType, vscode.Range[]>();
    for (const decorationType of this.keywordConfiguration.decorationTypes.values()) {
      typeRangesMap.set(decorationType, []);
    }
    for (const lineInfo of this.decorationLines) {
      const decorationType = this.keywordConfiguration.decorationTypes.get(lineInfo.keyword);
      if (decorationType === undefined) {
        continue;
      }
      typeRangesMap.get(decorationType)?.push(lineInfo.range);
    }
    for (const [decorationType, ranges] of typeRangesMap) {
      editor.setDecorations(decorationType, ranges);
    }
  }

  undecorateEditor(editor: vscode.TextEditor) {
    for (const decorationType of this.keywordConfiguration.decorationTypes.values()) {
      editor.setDecorations(decorationType, []);
    }
  }

  hasMetadata(): boolean {
    return this.mainContentStartLineNumber > 0;
  }

  isMetadataAffected(change: vscode.TextDocumentContentChangeEvent): boolean {
    return change.range.start.line < this.mainContentStartLineNumber;
  }

  isMainContentAffected(change: vscode.TextDocumentContentChangeEvent): boolean {
    return change.range.end.line >= this.mainContentStartLineNumber;
  }

  onDocChange(doc: vscode.TextDocument, change: vscode.TextDocumentContentChangeEvent) {
    const changeStartLineNumber = change.range.start.line;
    const changeEndLineNumber = change.range.end.line;
    const lineCountDiff = change.text.split('\n').length - (changeEndLineNumber - changeStartLineNumber + 1);
    const rematchEndLineNumber = changeEndLineNumber + lineCountDiff;
    const replaceArray: DecorationLineInfo[] = [];
    const decorateLineRegexp = this.keywordConfiguration.decorateLineRegexp;
    for (let i = changeStartLineNumber; i <= rematchEndLineNumber && i < doc.lineCount; i++) {
      const lineText = doc.lineAt(i).text;
      const match = lineText.match(decorateLineRegexp);
      if (match === null) {
        continue;
      }
      const keyword = match[3];
      const range = new vscode.Range(i, match[1].length, i, match[1].length + keyword.length);
      replaceArray.push({
        lineNumber: i,
        keyword,
        range,
      });
    }
    const unchangedStartIndex = lodash.sortedIndexBy(
      this.decorationLines,
      // @ts-ignore
      { lineNumber: changeEndLineNumber + 1 },
      'lineNumber',
    );
    if (lineCountDiff !== 0) {
      for (let i = unchangedStartIndex; i < this.decorationLines.length; i++) {
        const item = this.decorationLines[i];
        item.lineNumber += lineCountDiff;
        item.range = new vscode.Range(
          item.lineNumber,
          item.range.start.character,
          item.lineNumber,
          item.range.end.character,
        );
      }
    }
    const changeStartIndex = lodash.sortedIndexBy(
      this.decorationLines,
      // @ts-ignore
      { lineNumber: changeStartLineNumber },
      'lineNumber',
    );
    this.decorationLines.splice(changeStartIndex, unchangedStartIndex - changeStartIndex, ...replaceArray);
  }
}
