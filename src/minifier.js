// src/minifier.js
const fs = require('fs').promises;
const path = require('path');
const { minify: terserMinify } = require('terser');
const { minify: htmlMinify } = require('html-minifier-terser');
const postcss = require('postcss');
const cssnano = require('cssnano');

async function processFile(filePath, options) {
  const ext = path.extname(filePath).toLowerCase();
  let content;

  try {
    content = await fs.readFile(filePath, 'utf8');
  } catch (readError) {
    console.error(`Failed to read file ${filePath}: ${readError.message}`);
    return;
  }

  let minifiedContent = content;
  let minified = false;

  try {
    if (ext === '.js') {
      const result = await terserMinify(content, {
        compress: {
          drop_console: options.dropConsole, // Use option
        },
        mangle: options.mangle, // Use option
      });
      if (result.error) throw result.error;
      minifiedContent = result.code;
      minified = true;
    } else if (ext === '.css') {
      const result = await postcss([cssnano]).process(content, { from: filePath, to: filePath });
      minifiedContent = result.css;
      minified = true;
    } else if (ext === '.html') {
      minifiedContent = await htmlMinify(content, {
        collapseWhitespace: options.collapseWhitespace,
        removeComments: options.removeComments,
        removeRedundantAttributes: options.removeRedundantAttributes,
        useShortDoctype: options.useShortDoctype,
        minifyCSS: options.minifyCss,
        minifyJS: options.minifyJs,
      });
      minified = true;
    }

    if (minified) {
      await fs.writeFile(filePath, minifiedContent, 'utf8');
      // Relative path for better output in CLI
      console.log(`Minified and overwritten: ${path.relative(process.cwd(), filePath)}`);
    } else {
      console.log(`Skipping (no minification applied): ${path.relative(process.cwd(), filePath)}`);
    }

  } catch (minifyError) {
    console.error(`Error minifying ${path.relative(process.cwd(), filePath)}: ${minifyError.message}`);
  }
}

async function traverseAndMinifyDirectory(directory, options) {
  let files;
  try {
    files = await fs.readdir(directory);
  } catch (readDirError) {
    console.error(`Failed to read directory ${directory}: ${readDirError.message}`);
    return;
  }

  for (const file of files) {
    const filePath = path.join(directory, file);
    let stat;
    try {
      stat = await fs.stat(filePath);
    } catch (statError) {
      console.error(`Failed to get stat for ${filePath}: ${statError.message}`);
      continue;
    }

    if (stat.isDirectory()) {
      await traverseAndMinifyDirectory(filePath, options);
    } else {
      const ext = path.extname(filePath).toLowerCase();
      if (['.js', '.css', '.html'].includes(ext)) {
        await processFile(filePath, options);
      }
    }
  }
}

// Export the main function that the CLI will call
module.exports = { traverseAndMinifyDirectory, processFile};
