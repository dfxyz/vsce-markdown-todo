# Markdown TODO

A VSCode extension for managing TODO states in Markdown files with org-mode style cycling.

## Features

- Cycling TODO/DONE states in Markdown headings and unordered list items
- State keywords highlighting

## Usage

1. Place cursor on a Markdown heading or list item line
2. Use one of these commands:
   - `markdown-todo.cycleTodoState` (Default: `Ctrl+Alt+J`)
   - `markdown-todo.cycleTodoStateBackward` (Default: `Ctrl+Alt+K`)

## Example

Here is an unordered list for demonstration:

- Item1
- Item2
- Item3

Cycling `Item1` once, it becomes a todo task:

- <b style="color: #C05430">TODO</b> Item1
- Item2
- Item3

Cycling `Item1` twice, it becomes a finished task:

- <b style="color: #008020">DONE</b> Item1
- Item2
- Item3

Cycling `Item1` three times, the todo state mark is cleared:

- Item1
- Item2
- Item3

