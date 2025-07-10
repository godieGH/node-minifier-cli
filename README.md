minifier-cli
A command-line interface (CLI) tool to recursively minify JavaScript, CSS, and HTML files in a specified directory or a single file. Optimize your web assets for production with ease!
✨ Features
 * Minifies JavaScript: Uses terser for advanced JS minification, including dropping console logs and mangling variable names.
 * Minifies CSS: Leverages postcss and cssnano for efficient CSS compression.
 * Minifies HTML: Employs html-minifier-terser to optimize HTML, including collapsing whitespace, removing comments, and minifying inline CSS/JS.
 * Recursive Directory Traversal: Processes all supported files within a given directory and its subfolders.
 * Single File Minification: Can also minify individual .js, .css, or .html files.
 * Configurable Options: Control minification aggressiveness via CLI flags.

## 🚀 Installation
You can install minifier-cli globally using npm, which makes the minifier command available in your terminal from any directory.
```bash
npm install -g minifier-cli
```

## 💡 Usage
To minify files, simply run the minifier command followed by the path to your target directory or file.
```bash
minifier <path> [options]
```

 * `<path>`: The required path to the directory or file you want to minify.
   * If a directory, it will recursively process all .js, .css, and .html files.
   * If a file, it will process that specific file (if supported).
Examples:
Minify all supported files in the current directory:
```bash
minifier .
```

Minify files in a specific build directory:
```bash
minifier build/dist
```

Minify only a specific HTML file:
```bash
minifier public/index.html
```

## ⚙️ Options
You can customize the minification behavior using the following command-line flags:
| Short Flag | Long Flag | Description | Default |
|---|---|---|---|
| -d | --drop-console | Drop console.log statements and other console methods in JavaScript. | false |
| -m | --mangle | Mangle (shorten/obfuscate) variable and function names in JavaScript. | true |
|  | --no-collapse-whitespace | Do not collapse extra whitespace in HTML files. | true |
|  | --no-remove-comments | Do not remove HTML comments. | true |
|  | --no-remove-redundant-attributes | Do not remove redundant HTML attributes (e.g., type="text/javascript"). | true |
|  | --no-use-short-doctype | Do not replace doctype with the short HTML5 doctype `(<!DOCTYPE html>)`. | true |
|  | --no-minify-css | Do not minify CSS within `<style>` tags in HTML files. | true |
|  | --no-minify-js | Do not minify JavaScript within `<script>` tags in HTML files. | true |

Examples with Options:
Minify build directory, dropping console logs and disabling JS variable mangling:
```bash
minifier build --drop-console --no-mangle
````
Minify public directory, but keep all comments and whitespace in HTML:
minifier public --no-remove-comments --no-collapse-whitespace

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
