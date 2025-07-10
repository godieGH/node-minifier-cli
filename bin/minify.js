#!/usr/bin/env node

const { program } = require('commander');
const fs = require('fs').promises;
const path = require('path');
const { traverseAndMinifyDirectory } = require('../src/minifier'); // Adjust path if needed

program
  .version('1.0.2') // Your package version
  .name('minifier')
  .description('Minifies .js, .css, and .html files recursively in a specified path.')
  .argument('<path>', 'The path to the directory or file to minify.')
  .option('-d, --drop-console', 'Drop console.log statements in JavaScript.', false)
  .option('-m, --mangle', 'Mangle variable and function names in JavaScript.', true)
  .option('--no-collapse-whitespace', 'Do not collapse whitespace in HTML.', true) // Default true, so --no- prefix to disable
  .option('--no-remove-comments', 'Do not remove comments in HTML.', true)
  .option('--no-remove-redundant-attributes', 'Do not remove redundant attributes in HTML.', true)
  .option('--no-use-short-doctype', 'Do not replace doctype with short HTML5 doctype in HTML.', true)
  .option('--no-minify-css', 'Do not minify CSS in <style> tags within HTML.', true)
  .option('--no-minify-js', 'Do not minify JS in <script> tags within HTML.', true)
  .action(async (inputPath, options) => {
    const absolutePath = path.resolve(process.cwd(), inputPath);

    console.log(`\n--- Starting Minification Process ---`);
    console.log(`Targeting path: ${absolutePath}`);
    console.log('Minification Options:', options);

    try {
      const stat = await fs.stat(absolutePath);

      if (stat.isDirectory()) {
        await traverseAndMinifyDirectory(absolutePath, options);
      } else if (stat.isFile()) {
        // You might want to process single files directly if that's a common use case
        // For now, the processFile function is called via traverseAndMinifyDirectory,
        // so we'll rely on that. You could add specific single-file logic if preferred.
        // For simplicity, let's just make it clear that it expects a directory for recursive action.
        console.warn(`Warning: '${inputPath}' is a file. Minification will only apply if it's a supported type.`);
        await require('../src/minifier').processFile(absolutePath, options); // Call processFile directly for single files
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

