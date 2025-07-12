#!/usr/bin/env node

const { program } = require('commander');
const fs = require('fs').promises;
const path = require('path');
const { traverseAndMinifyDirectory, processFile } = require('../src/minifier'); // Adjust path if needed

// Assuming package.json is in the parent directory of 'bin'
const pkgJson = require('../package.json');
const pkgVersion = pkgJson.version;

/**
 * Loads ignore patterns from a file (e.g., .minifierignore).
 * @param {string} ignoreFilePath - The path to the ignore file.
 * @returns {Promise<string[]>} An array of patterns.
 */
async function loadIgnoreFile(ignoreFilePath) {
  try {
    const content = await fs.readFile(ignoreFilePath, 'utf8');
    // Split by new line, filter out empty lines and comments
    return content.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return []; // File not found is not an error, just means no patterns to load.
    }
    console.error(`Error reading ignore file '${ignoreFilePath}': ${error.message}`);
    return [];
  }
}

program
  .version(pkgVersion)
  .name('minifier')
  .description('Minifies .js, .css, and .html files recursively, with options.')
  .argument('<path>', 'The path to the directory or file to minify.')
  // --- ENHANCED OPTIONS ---
  .option('--no-verbose', 'Disable verbose logging for detailed output.', true)
  .option('--dry-run', 'Simulate minification without writing any files.', false)
  // --- CORE OPTIONS ---
  .option('-d, --drop-console', 'Drop console.log statements in JavaScript.', false)
  .option('-m, --mangle', 'Mangle variable and function names in JavaScript.', true)
  .option('--no-mangle', 'Do not mangle variable and function names in JavaScript.')
  .option('--no-collapse-whitespace', 'Do not collapse whitespace in HTML.')
  .option('--no-remove-comments', 'Do not remove comments in HTML.')
  .option('--no-remove-redundant-attributes', 'Do not remove redundant attributes in HTML.')
  .option('--no-use-short-doctype', 'Do not replace doctype with short HTML5 doctype.')
  .option('--no-minify-css', 'Do not minify CSS in <style> tags within HTML.')
  .option('--no-minify-js', 'Do not minify JS in <script> tags within HTML.')
  .option('-i, --ignore <paths>', 'Comma-separated list of file/directory patterns to ignore.', (value, previous) => (previous || []).concat(value.split(',')), [])
  .option('--ignore-path <file>', 'Path to a .minifierignore file (e.g., ./.minifierignore).')
  .option('-s, --source-map', 'Generate source maps for minified files.', false)
  .option('--source-map-dir <directory>', 'Specify a directory to save source maps, relative to the original file\'s directory.')
  .option('-o, --output-dir <path>', 'Specify an output directory for minified files, relative or absolute. Can include a renaming pattern (e.g., "**/*.min.js").')
  .action(async (inputPath, options) => {
    const absolutePath = path.resolve(process.cwd(), inputPath);
    let ignorePatterns = [];

    let basePathForIgnore;
    try {
      const stat = await fs.stat(absolutePath);
      basePathForIgnore = stat.isDirectory() ? absolutePath : path.dirname(absolutePath);
    } catch (error) {
      console.error(`Error: Could not find path '${inputPath}'. Please provide a valid file or directory.`);
      process.exit(1);
    }

    // Determine the ignore file path, prioritizing the CLI option
    const minifierIgnoreFile = options.ignorePath
      ? path.resolve(process.cwd(), options.ignorePath)
      : path.join(basePathForIgnore, '.minifierignore');

    if (options.verbose) {
        console.log(`Searching for ignore file at: ${minifierIgnoreFile}`);
    }
    ignorePatterns = await loadIgnoreFile(minifierIgnoreFile);

    // Add patterns from the --ignore flag
    if (options.ignore && options.ignore.length > 0) {
      ignorePatterns = ignorePatterns.concat(options.ignore);
    }

    const minifierOptions = {
      ...options,
      ignorePatterns,
      basePath: basePathForIgnore,
    };

    if (options.dryRun) {
      console.log('\n--- ⚠️  Starting in Dry Run Mode (no files will be changed) ---');
    } else {
      console.log(`\n--- Starting Minification Process ---`);
    }
    
    if (options.verbose) {
        console.log(`\nTargeting path: ${absolutePath}`);
        console.log('Effective Options:', minifierOptions);
    }

    try {
      const stat = await fs.stat(absolutePath);
      if (stat.isDirectory()) {
        await traverseAndMinifyDirectory(absolutePath, minifierOptions);
      } else if (stat.isFile()) {
        await processFile(absolutePath, minifierOptions);
      }
    } catch (checkPathError) {
      console.error(`An unexpected error occurred: ${checkPathError.message}`);
      process.exit(1);
    }
    console.log('\n--- ✅ Process Complete. ---');
  });

program.parse(process.argv);

