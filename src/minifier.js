// bin/minify.js
#!/usr/bin/env node

const { program } = require('commander');
const fs = require('fs').promises;
const path = require('path');
const ignore = require('ignore'); // New dependency
const { traverseAndMinifyDirectory, processFile } = require('../src/minifier'); // Adjust path as per your project structure

program
  .version('1.1.0') // Updated package version for the new feature
  .name('minifier')
  .description('Minifies .js, .css, and .html files recursively in a specified path, respecting ignore patterns from .minifierignore files and --ignore flag.')
  .argument('<path>', 'The path to the directory or file to minify.')
  .option('-d, --drop-console', 'Drop console.log statements in JavaScript.', false)
  .option('-m, --mangle', 'Mangle variable and function names in JavaScript.', true)
  .option('--no-collapse-whitespace', 'Do not collapse whitespace in HTML.', true) // Default true, so --no- prefix to disable
  .option('--no-remove-comments', 'Do not remove comments in HTML.', true)
  .option('--no-remove-redundant-attributes', 'Do not remove redundant attributes in HTML.', true)
  .option('--no-use-short-doctype', 'Do not replace doctype with short HTML5 doctype in HTML.', true)
  .option('--no-minify-css', 'Do not minify CSS in <style> tags within HTML.', true)
  .option('--no-minify-js', 'Do not minify JS in <script> tags within HTML.', true)
  .option('-i, --ignore <paths>', 'Comma-separated list of files/directories to ignore (e.g., "dist/,node_modules/,file.js"). These patterns are relative to the input path.', (value) => value.split(',').filter(Boolean), [])
  .action(async (inputPath, options) => {
    const absolutePath = path.resolve(process.cwd(), inputPath);

    console.log(`\n--- Starting Minification Process ---`);
    console.log(`Targeting path: ${absolutePath}`);
    console.log('Minification Options:', options);

    // Initialize the global ignore instance with CLI provided patterns.
    // These patterns are considered relative to the absolutePath provided by the user.
    const globalIg = ignore();
    if (options.ignore && options.ignore.length > 0) {
      globalIg.add(options.ignore);
    }

    try {
      const stat = await fs.stat(absolutePath);

      if (stat.isDirectory()) {
        await traverseAndMinifyDirectory(absolutePath, options, globalIg, absolutePath);
      } else if (stat.isFile()) {
        // For a single file, the ignore patterns from the CLI are relative to the file's own directory
        // or can match its basename.
        const relativeSelfPath = path.relative(absolutePath, absolutePath); // This will typically be '.' or ''
        const fileName = path.basename(absolutePath);

        // Check if the single file is ignored by the global CLI ignore patterns.
        // We check against its relative path (e.g., '.') and its base name.
        if (globalIg.ignores(relativeSelfPath) || globalIg.ignores(fileName)) {
            console.log(`Ignoring single file as per CLI ignore rules: ${path.relative(process.cwd(), absolutePath)}`);
            process.exit(0); // Exit gracefully if the single file is ignored
        }
        // If not ignored, process the single file
        await processFile(absolutePath, options);
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
