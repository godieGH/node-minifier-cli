# Minifier CLI Documentation
Minifier CLI is a powerful node command-line tool designed to minify JavaScript, CSS, and HTML files recursively within a specified directory or for individual files. It leverages popular minification libraries like Terser, cssnano, and html-minifier-terser to achieve optimal file size reduction.

## Table of Contents
 * [Installation](#installation)
 * [Usage](#usage)
   * [Basic Usage](#basic-usage)
   * [Minifying Files and Directories](#minifying-files-and-directories)
   * [Options](#options)
   * [Ignoring Files and Directories](#ignoring-files-and-directories)
 * [Configuration Options Reference](#configuration-Options-reference)
 * [Ignore Patterns Reference](#ignore-patterns-reference)
 * [Examples](#examples)

### Installation
To install Minifier CLI globally on your system, open your terminal or command prompt and run the following command:

```bash
npm install -g minifier-cli
#or
yarn add -g minifier-cli
```

> This will make the minifier command available system-wide.

## Usage
The minifier command follows a simple structure:

```bash
minifier <path> [options]
```

### Basic Usage
You must provide a `<path>` argument, which can be either a `file` or a `directory`.
 * Minify the current directory:
   ```bash
   minifier .
   ```

 * Minify a specific directory:
   ```bash
   minifier my_project/
   ```

 * Minify a single file:
   ```bash
   minifier public/index.html
   # or
   minifier src/app.js
   # or
   minifier assets/styles.css
   ```

### Minifying Files and Directories
When you specify a directory, minifier will recursively traverse all subdirectories and minify .js, .css, and .html files it finds. When you specify a file, only that specific file will be processed.

## Options
You can control the minification process using various options. These options are placed after the `<path>` argument.
### Ignoring Files and Directories
Minifier CLI provides flexible ways to ignore specific files or directories from the minification process, similar to `.gitignore`.

1. Using the `--ignore` Flag
  > Use the `-i` or `--ignore` flag followed by a comma-separated list of minimatch patterns. You can use this flag multiple times.
 
 * Ignore a specific file:
   ```bash 
   minifier . -i "index.html"
   ```

 * Ignore a specific directory:
   ```bash
   minifier my_project/ --ignore "images/"
   ```

 * Ignore all files of a certain type in the current directory (non-recursive):
   ```bash
   minifier . -i "*.map"
   ```

 * Ignore all files of a certain type recursively:
   ```bash
   minifier . -i "**/*.js"
   ````

   > Note: A single `*` matches within a single path segment. Use `**/*.ext` to ignore files recursively across all subdirectories.
  
  * Ignore multiple patterns:
   ```bash
   minifier my_project/ -i "images/,dist/css/"
   ```

2. Using an .minifierignore File

> You can create a file named `.minifierignore` in the base directory you are minifying (or specify a custom path) to list patterns of files/directories to ignore. This works just like .gitignore.

 * Example `.minifierignore` content:
   ```bash
   # Ignore specific files
   dist/index.html
   src/config.js
   # Ignore entire directories
   
   images/
   temp_files/
   
   # Ignore all files of a specific type recursively
   **/*.map
   node_modules/
   ```

 * Usage with default `.minifierignore`:
   Place the `.minifierignore` file in the same directory as your project root, then run:
   ```bash
   minifier my_project/
   ```

   or if you're in the project root:
   ```bash
   minifier .
   ```

3. Using a Custom Ignore File Path

> Specify a custom path to your ignore file using the `--ignore-path` flag:

```bash
minifier my_project/ --ignore-path config/.custom_ignore_rules
```

> Note: Patterns provided via the `--ignore` flag will be combined with patterns found in the `.minifierignore` file (if present).

## Configuration Options Reference

The following table details all available options for customizing the minification process:
| Short Flag | Long Flag | Description | Default | Disable Flag (for defaults that are true) |
|---|---|---|---|---|
| -V | --version | Output the version number. | N/A | N/A |
| -h | --help | Display help for the command. | N/A | N/A |
| -d | --drop-console | Drop console.log statements in JavaScript files. | false | N/A |
| -m | --mangle | Mangle variable and function names in JavaScript files. | true | --no-mangle |
|  | --collapse-whitespace | Collapse whitespace in HTML files. | true | --no-collapse-whitespace |
|  | --remove-comments | Remove comments in HTML files. | true | --no-remove-comments |
|  | --remove-redundant-attributes | Remove redundant attributes in HTML files. | true | --no-remove-redundant-attributes |
|  | --use-short-doctype | Replace doctype with short HTML5 doctype (` <!DOCTYPE html>`) in HTML files. | true | --no-use-short-doctype |
|  | --minify-css | Minify CSS in `<style>` tags within HTML files. | true | --no-minify-css |
|  | --minify-js | Minify JavaScript in `<script>` tags within HTML files. | true | --no-minify-js |
| -i | --ignore `<paths>` | Comma-separated list of minimatch patterns (files/directories) to ignore. Can be specified multiple times. | [] | N/A |
|  | --ignore-path `<file>` | Path to a custom `.minifierignore` file. Looks for `.minifierignore` in the target path's directory by default. | N/A | N/A |
|  -s | --source-map | create a source map file for your minified file (css, js) to simplify brower debuging | false | N/A |
|  | --source-map-dir `<path>` | Specify where to save your map files, If don't used `minifier` will save the the map file to where the minified file is saved | (Save where minified file is saved) | N/A |
| -o `<path>` | --output-dir `<path>` | Specify an output directory for minified files, relative or absolute. Can include a renaming pattern (e.g., `"**/*.min.js"`). | overwrite | N/A |
|  | --dry-run | Simulate minification without writing any files, just to see what files would be minified | false | N/A |
|  | --no-verbose | Disable verbose logging for detailed output. | true | N/A |

## Ignore Patterns Reference

> Minifier CLI uses minimatch for pattern matching, which is the same library used by Git.

| Pattern | Description |
|---|---|
| foo.txt | Matches foo.txt in the base directory. |
| dir/ | Matches the directory dir and all its contents (e.g., dir/file.txt, dir/subdir/another.js). |
| /foo.txt | Matches foo.txt only in the base directory, not in subdirectories (e.g., will not match subdir/foo.txt). |
| *.js | Matches all files ending with .js in the base directory (e.g., app.js), but not in subdirectories (e.g., will not match src/utils.js). |
| **/*.js | Matches all files ending with .js in the base directory and all its subdirectories (e.g., app.js, src/utils.js, lib/components/button.js). This is the most common pattern for recursive file type ignoring. |
| foo/** | Matches everything inside the foo directory. Equivalent to foo/. |
| foo/**/bar.js | Matches bar.js in foo/bar.js, foo/baz/bar.js, foo/baz/qux/bar.js, etc. |
| !pattern | Negates a pattern. If a file matches a previous ignore pattern but also matches a later negated pattern, it will not be ignored. (e.g., build/, !build/index.html would ignore the build directory except for build/index.html). |
| # comment | Lines starting with # in .minifierignore are treated as comments and ignored. |
| (empty) | Empty lines in .minifierignore are ignored. |

### Examples
 * Minify the entire public directory, drop console.log statements, and keep comments in HTML:
   ```bash
   minifier public/ -d --no-remove-comments
   ```

 * Minify the current directory, ignore the node_modules and dist folders, and all .map files recursively:
   ```bash
   minifier . -i "node_modules/,dist/,**/*.map"
   ```

 * Process only index.html and main.js from the build directory, disabling JS mangling and CSS minification within HTML:
   ```bash
   minifier build/index.html build/main.js --no-mangle --no-minify-css
   ```

   > (Note: To process multiple specific files, you would typically run the command for each file or use a script. The `minifier <path>` argument expects a single file or directory as its primary target.)
 
 * Minify your src directory using a custom ignore file located at config/my_project.ignore:
   ```bash
   minifier src/ --ignore-path config/my_project.ignore
   ```

 * Minify all JavaScript files in the current directory, but specifically don't drop console statements:
   ```bash
   minifier . --no-drop-console # Although default, explicitly shows how to negate if it were true
   ```
   
   > (Note: The --no- prefix only applies to boolean options that default to true.)

   * Minify build directory, dropping console logs and disabling JS variable mangling:
   ```bash
   minifier build --drop-console --no-mangle
   ````
   * Minify public directory, but keep all comments and whitespace in HTML:
   ```bash
   minifier public --no-remove-comments --no-collapse-whitespace
   ```

### ❓ Help & Version
To see the full list of commands and options directly from your terminal:
minifier --help

To check the installed version:
```bash
minifier --version
````

### 🤝 Contributing
Contributions are welcome! If you find a bug or have a feature request, please open an issue on the GitHub repository.
[Here](https://github.com/godieGH/node-minifier-cli.git)

### 📄 License
This project is licensed under the `MIT License`.
