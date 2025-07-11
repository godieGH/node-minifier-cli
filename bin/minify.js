#!/usr/bin/env node

const { program } = require('commander');
const fs = require('fs').promises;
const path = require('path');
const { traverseAndMinifyDirectory, processFile } = require('../src/minifier'); // Adjust path if needed

const pkgJson = require('../package.json');
const pkgVerson = pkgJson.version;

// Function to load ignore patterns from a file
async function loadIgnoreFile(ignoreFilePath) {
  try {
    const content = await fs.readFile(ignoreFilePath, 'utf8');
    // Split by new line, filter out empty lines and comments
    return content.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return []; // File not found, return empty array
    }
    console.error(`Error reading ignore file '${ignoreFilePath}': ${error.message}`);
    return [];
  }
}

program
  .version(pkgVerson)
  .name('minifier')
  .description('Minifies .js, .css, and .html files recursively in a specified path, with ignore capabilities.')
  .argument('<path>', 'The path to the directory or file to minify.')
  .option('-d, --drop-console', 'Drop console.log statements in JavaScript.', false)
  .option('-m, --mangle', 'Mangle variable and function names in JavaScript.', true) // This sets the default to true
  .option('--no-mangle', 'Do not mangle variable and function names in JavaScript.') // This explicitly creates the --no-mangle option
  .option('--no-collapse-whitespace', 'Do not collapse whitespace in HTML.', true)
  .option('--no-remove-comments', 'Do not remove comments in HTML.', true)
  .option('--no-remove-redundant-attributes', 'Do not remove redundant attributes in HTML.', true)
  .option('--no-use-short-doctype', 'Do not replace doctype with short HTML5 doctype in HTML.', true)
  .option('--no-minify-css', 'Do not minify CSS in <style> tags within HTML.', true)
  .option('--no-minify-js', 'Do not minify JS in <script> tags within HTML.', true)
  .option('-i, --ignore <paths>', 'Comma-separated list of file/directory patterns to ignore (e.g., "index.html,images/,dist/**/*.js").', (value, previous) => (previous || []).concat(value.split(',')), [])
  .option('--ignore-path <file>', 'Path to a .minifierignore file (default: .minifierignore in the target path).')
  .action(async (inputPath, options) => {
    const absolutePath = path.resolve(process.cwd(), inputPath);
    let ignorePatterns = [];

    // Determine the base path for ignore patterns.
    // If inputPath is a file, the base path is its directory.
    // If inputPath is a directory, the base path is itself.
    let basePathForIgnore;
    try {
      const stat = await fs.stat(absolutePath);
      basePathForIgnore = stat.isDirectory() ? absolutePath : path.dirname(absolutePath);
    } catch (error) {
      console.error(`Error determining base path for ignore patterns: ${error.message}`);
      process.exit(1);
    }

    // Load patterns from .minifierignore file
    let minifierIgnoreFile = options.ignorePath;
    if (!minifierIgnoreFile) {
      // If no --ignore-path is specified, look for .minifierignore in the input path's directory
      minifierIgnoreFile = path.join(basePathForIgnore, '.minifierignore');
    }
    ignorePatterns = await loadIgnoreFile(minifierIgnoreFile);

    // Add patterns from --ignore option
    if (options.ignore && options.ignore.length > 0) {
      ignorePatterns = ignorePatterns.concat(options.ignore);
    }

    // Pass ignore patterns and base path to the minifier functions
    const minifierOptions = {
      ...options,
      ignorePatterns: ignorePatterns,
      basePath: basePathForIgnore, // This is crucial for minimatch relative paths
    };

    console.log(`\n--- Starting Minification Process ---`);
    console.log(`Targeting path: ${absolutePath}`);
    console.log('Minification Options:', minifierOptions);
    if (ignorePatterns.length > 0) {
      console.log('Ignore Patterns:', ignorePatterns);
    }

    try {
      const stat = await fs.stat(absolutePath);

      if (stat.isDirectory()) {
        await traverseAndMinifyDirectory(absolutePath, minifierOptions);
      } else if (stat.isFile()) {
        await processFile(absolutePath, minifierOptions);
      } else {
        console.error(`Error: The path '${inputPath}' is not a valid file or directory.`);
        process.exit(1);
      }
    } catch (checkPathError) {
      if (checkPathError.code === 'ENOENT') {
        console.error(`Error: The path '${inputPath}' does not exist.`);
      } else {
        console.error(`Error checking path '${inputPath}': ${checkPathError.message}`);
      }
      process.exit(1);
    }
    console.log('\n--- Minification Complete. ---');
  });

program.parse(process.argv);
