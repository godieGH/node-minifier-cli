const fs = require('fs').promises;
const path = require('path');
const { minify: terserMinify } = require('terser');
const { minify: htmlMinify } = require('html-minifier-terser');
const postcss = require('postcss');
const cssnano = require('cssnano');
const { minimatch } = require('minimatch'); // Import minimatch

/**
 * Checks if a file or directory should be ignored based on provided patterns.
 * @param {string} filePath The absolute path to the file or directory.
 * @param {string[]} ignorePatterns An array of minimatch patterns to ignore.
 * @param {string} baseDir The base directory from which the patterns are relative.
 * @returns {boolean} True if the file/directory should be ignored, false otherwise.
 */
function isIgnored(filePath, ignorePatterns, baseDir) {
  const relativePath = path.relative(baseDir, filePath);

  // If the path is the base directory itself, we shouldn't ignore it unless explicitly asked.
  // This helps avoid ignoring the root directory being processed.
  if (relativePath === '' || relativePath === '.') {
    return false;
  }

  // Normalize paths for consistent matching (e.g., convert backslashes to forward slashes on Windows)
  const normalizedPath = relativePath.replace(/\\/g, '/');

  for (const pattern of ignorePatterns) {
    const normalizedPattern = pattern.replace(/\\/g, '/');

    // Handle directory patterns: if pattern ends with '/', it matches directory contents
    // if the path is a directory and matches the pattern, it should be ignored.
    // If the path is a file within an ignored directory, it also should be ignored.
    if (minimatch(normalizedPath, normalizedPattern, { dot: true })) {
      return true;
    }

    // Handle patterns that specifically target directories
    if (minimatch(normalizedPath, normalizedPattern + '/**', { dot: true }) && fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      return true;
    }
  }
  return false;
}

async function processFile(filePath, options) {
  const ext = path.extname(filePath).toLowerCase();
  let content;

  // Check if the file should be ignored
  if (options.ignorePatterns && isIgnored(filePath, options.ignorePatterns, options.basePath)) {
    console.log(`Ignoring (matches ignore pattern): ${path.relative(process.cwd(), filePath)}`);
    return;
  }

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
          drop_console: options.dropConsole,
        },
        mangle: options.mangle,
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
      console.log(`Minified and overwritten: ${path.relative(process.cwd(), filePath)}`);
    } else {
      console.log(`Skipping (no minification applied): ${path.relative(process.cwd(), filePath)}`);
    }

  } catch (minifyError) {
    console.error(`Error minifying ${path.relative(process.cwd(), filePath)}: ${minifyError.message}`);
  }
}

async function traverseAndMinifyDirectory(directory, options) {
  // Check if the directory itself should be ignored
  if (options.ignorePatterns && isIgnored(directory, options.ignorePatterns, options.basePath)) {
    console.log(`Ignoring directory (matches ignore pattern): ${path.relative(process.cwd(), directory)}`);
    return;
  }

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
module.exports = { traverseAndMinifyDirectory, processFile, isIgnored }; // Export isIgnored for testing if needed
