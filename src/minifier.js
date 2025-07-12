const fs = require('fs').promises;
const path = require('path');
const { minify: terserMinify } = require('terser');
const { minify: htmlMinify } = require('html-minifier-terser');
const postcss = require('postcss');
const cssnano = require('cssnano');
const { minimatch } = require('minimatch');


/**
 * Checks if a file or directory should be ignored based on provided patterns.
 * @param {string} filePath The absolute path to the file or directory.
 * @param {string[]} ignorePatterns An array of minimatch patterns to ignore.
 * @param {string} baseDir The base directory from which the patterns are relative.
 * @returns {boolean} True if the file/directory should be ignored, false otherwise.
 */
function isIgnored(filePath, ignorePatterns, baseDir) {
  // ✅ Default patterns to ignore common config files

  const DEFAULT_IGNORE_PATTERNS = [
    // General config files (covers Vite, PostCSS, Tailwind, Next.js, etc.)
    '**/*.config.{js,cjs,mjs}',

    // RC files (covers ESLint, Babel, Stylelint, Prettier)
    '**/{.,}*rc.{js,cjs,json}',

    // Specific build tools
    '**/webpack.*.js',        // For multi-file Webpack configs (e.g., webpack.dev.js)
    '**/gulpfile.{js,mjs}',     // For Gulp
    '**/Gruntfile.js',          // For Grunt
    '**/rollup.config.js',      // For Rollup

    // Testing frameworks
    '**/jest.config.js',
    '**/jest.setup.js',
    '**/playwright.config.js',
    '**/cypress.config.js',

    // Other common tools
    '**/babel.config.js',
    '**/eslint.config.js',    // For new ESLint flat config
  ];

  // Combine default patterns with user-provided patterns
  const allPatterns = [...new Set([...DEFAULT_IGNORE_PATTERNS, ...(ignorePatterns || [])])];

  const relativePath = path.relative(baseDir, filePath);
  if (relativePath === '' || relativePath === '.') {
    return false;
  }
  const normalizedPath = relativePath.replace(/\\/g, '/');

  // Check against the combined list of patterns
  for (const pattern of allPatterns) {
    const normalizedPattern = pattern.replace(/\\/g, '/');
    if (minimatch(normalizedPath, normalizedPattern, { dot: true })) {
      return true;
    }
    // Ensure patterns matching directories also match their contents
    if (minimatch(normalizedPath + '/', normalizedPattern + '/', { dot: true })) {
        return true;
    }
  }
  return false;
}

/**
 * Helper to format bytes into a readable string (B, KB, MB).
 * @param {number} bytes The number of bytes.
 * @returns {string} The formatted size string.
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}


/**
 * Processes a single file: lints, minifies, and saves it.
 * @param {string} filePath The absolute path to the file.
 * @param {object} options The full set of minifier options.
 * @returns {object} An object containing the processing result.
 */
async function processFile(filePath, options) {
  const ext = path.extname(filePath).toLowerCase();
  const fileName = path.basename(filePath);
  const dirName = path.dirname(filePath);
  const relativeFilePath = path.relative(process.cwd(), filePath);

  const result = {
    filePath: relativeFilePath,
    originalSize: 0,
    minifiedSize: 0,
    reduction: 0,
    reductionPercent: 0,
    status: 'Skipped',
    outputFilePath: null,
    sourceMapGenerated: false,
    error: null,
  };

  if (options.ignorePatterns && isIgnored(filePath, options.ignorePatterns, options.basePath)) {
    if (options.verbose) console.log(`Ignoring (matches pattern): ${relativeFilePath}`); // Log immediately
    result.status = 'Ignored';
    return result;
  }

  let originalContent;
  try {
    originalContent = await fs.readFile(filePath, 'utf8');
  } catch (readError) {
    result.status = 'Error';
    result.error = `Failed to read: ${readError.message}`;
    console.error(`Failed to read file ${relativeFilePath}: ${readError.message}`); // Log immediately
    return result;
  }

  result.originalSize = Buffer.byteLength(originalContent, 'utf8');

  let minifiedContent = originalContent;
  let minified = false;
  let sourceMapContent = null;

  let outputFilePath = filePath; // Default to original path (overwrite)

  if (options.outputDir) {
    const inputRelativePath = path.relative(options.basePath, filePath);
    let targetFileName = fileName;

    const outputDirExt = path.extname(options.outputDir);
    const outputDirBase = path.basename(options.outputDir);

    if (outputDirExt && outputDirBase.includes('*')) {
        const parts = options.outputDir.split(path.sep);
        const lastPart = parts[parts.length - 1];

        if (lastPart.startsWith('*')) {
            const newExtension = lastPart.substring(lastPart.indexOf('.'));
            targetFileName = path.basename(fileName, ext) + newExtension;
        } else {
            console.warn(`Complex output pattern '${options.outputDir}' might not be fully supported for renaming. Using original filename.`);
        }

        const baseOutputDir = path.join(process.cwd(), ...parts.slice(0, parts.length - 1));
        outputFilePath = path.join(baseOutputDir, inputRelativePath);
        outputFilePath = path.join(path.dirname(outputFilePath), targetFileName);
    } else {
        outputFilePath = path.join(path.resolve(process.cwd(), options.outputDir), inputRelativePath);
    }

    await fs.mkdir(path.dirname(outputFilePath), { recursive: true });
  }

  result.outputFilePath = path.relative(process.cwd(), outputFilePath);

  const sourceMapTargetDir = options.sourceMapDir
    ? path.resolve(dirName, options.sourceMapDir)
    : (options.outputDir ? path.dirname(outputFilePath) : dirName);

  const sourceMapActualFilePath = path.join(sourceMapTargetDir, `${path.basename(outputFilePath)}.map`);
  const sourceMapUrlRelativeFromMinifiedFile = path.relative(path.dirname(outputFilePath), sourceMapActualFilePath).replace(/\\/g, '/');

  try {
    const cleanedContent = originalContent.replace(/\/\/[#@]\s*sourceMappingURL=.*$/gm, '').replace(/\/\*#\s*sourceMappingURL=.*?\*\//g, '').trim();

    if (ext === '.js') {
      const terserOptions = {
        compress: { drop_console: options.dropConsole },
        mangle: options.mangle,
        sourceMap: options.sourceMap ? {
          filename: path.basename(outputFilePath),
          url: sourceMapUrlRelativeFromMinifiedFile,
        } : false,
      };
      const terserResult = await terserMinify({ [fileName]: cleanedContent }, terserOptions);
      if (terserResult.error) throw terserResult.error;

      minifiedContent = terserResult.code;
      minified = true;
      if (options.sourceMap && terserResult.map) {
        const mapObject = JSON.parse(terserResult.map);
        if (!mapObject.sourcesContent || mapObject.sourcesContent.length === 0) {
            mapObject.sourcesContent = [cleanedContent];
        }
        sourceMapContent = JSON.stringify(mapObject);
      }
    } else if (ext === '.css') {
      const postcssOptions = {
        from: filePath,
        to: outputFilePath,
        map: options.sourceMap ? {
          inline: false,
          annotation: sourceMapUrlRelativeFromMinifiedFile,
          sourcesContent: true,
        } : false,
      };
      const postcssResult = await postcss([cssnano]).process(cleanedContent, postcssOptions);
      minifiedContent = postcssResult.css;
      minified = true;
      if (options.sourceMap && postcssResult.map) {
        sourceMapContent = postcssResult.map.toString();
      }
    } else if (ext === '.html') {
      minifiedContent = await htmlMinify(originalContent, {
        collapseWhitespace: options.collapseWhitespace,
        removeComments: options.removeComments,
        removeRedundantAttributes: options.removeRedundantAttributes,
        useShortDoctype: options.useShortDoctype,
        minifyCSS: options.minifyCss,
        minifyJS: options.minifyJs,
      });
      minified = true;
    }

    if (minified && originalContent !== minifiedContent) {
      result.minifiedSize = Buffer.byteLength(minifiedContent, 'utf8');
      result.reduction = result.originalSize - result.minifiedSize;
      result.reductionPercent = result.originalSize > 0 ? (result.reduction / result.originalSize * 100) : 0;
      const sizeReport = `(${formatBytes(result.originalSize)} -> ${formatBytes(result.minifiedSize)}, -${result.reductionPercent.toFixed(1)}%)`;


      if (!options.dryRun) {
        await fs.writeFile(outputFilePath, minifiedContent, 'utf8');
        result.status = 'Minified';
        console.log(`Minified: ${relativeFilePath} -> ${result.outputFilePath} ${sizeReport}`); // Log immediately

        if (options.sourceMap && sourceMapContent) {
          await fs.mkdir(sourceMapTargetDir, { recursive: true });
          await fs.writeFile(sourceMapActualFilePath, sourceMapContent, 'utf8');
          result.sourceMapGenerated = true;
          console.log(`Source map generated: ${path.relative(process.cwd(), sourceMapActualFilePath)}`); // Log immediately
        }
      } else {
        result.status = '[DRY RUN] Minified';
        console.log(`[DRY RUN] Would minify ${relativeFilePath} to ${result.outputFilePath} ${sizeReport}`); // Log immediately
        if (options.sourceMap && sourceMapContent) {
            console.log(`[DRY RUN]   + Would generate source map: ${path.relative(process.cwd(), sourceMapActualFilePath)}`); // Log immediately
        }
      }
    } else {
      if (options.verbose) console.log(`Skipping (no changes after minification): ${relativeFilePath}`); // Log immediately
      result.status = 'No Change';
    }

  } catch (minifyError) {
    result.status = 'Error';
    result.error = minifyError.message;
    console.error(`\nError minifying ${relativeFilePath}:\n${minifyError.message}`); // Log immediately
  }
  return result;
}

/**
 * Recursively traverses a directory and processes files.
 * @param {string} directory The directory to traverse.
 * @param {object} options The minifier options.
 * @param {Array} results Accumulates the results of each processed file.
 */
async function traverseAndMinifyDirectory(directory, options, results) {
  if (options.ignorePatterns && isIgnored(directory, options.ignorePatterns, options.basePath)) {
    if (options.verbose) console.log(`Ignoring directory: ${path.relative(process.cwd(), directory)}`);
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
      await traverseAndMinifyDirectory(filePath, options, results);
    } else {
      const ext = path.extname(filePath).toLowerCase();
      if (['.js', '.css', '.html'].includes(ext)) {
        const fileResult = await processFile(filePath, options);
        results.push(fileResult);
      }
    }
  }
}

/**
 * Displays the minification results in a formatted table.
 * @param {Array} results An array of results from processed files.
 */
function displayResultsTable(results) {
  if (results.length === 0) {
    console.log('\nNo eligible files found for minification or all were ignored.');
    return;
  }

  console.log('\n--- Minification Summary ---');

  // Helper to collapse paths for table display
  const collapsePathForDisplay = (fullPath) => {
    if (!fullPath || fullPath === 'N/A') return fullPath;
    // Handle both Windows and Unix paths
    const parts = fullPath.split(path.sep).filter(p => p !== '');
    if (parts.length > 2) { // If there are more than two directory levels (e.g., dir1/dir2/file.js)
        return `.../${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
    } else if (parts.length === 2) { // If there's one directory level (e.g., dir1/file.js)
        return `${parts[0]}/${parts[1]}`; // Still show the directory and file
    }
    return fullPath; // For simple filenames or paths like 'file.js' or './file.js'
  };


  // Calculate maximum column widths
  const headers = ['File', 'Status', 'Original Size', 'Minified Size', 'Reduction', 'Output File', 'Source Map'];
  let maxWidths = headers.map(header => header.length);

  const formattedResults = results.map(r => {
    const originalSizeFormatted = formatBytes(r.originalSize);
    const minifiedSizeFormatted = formatBytes(r.minifiedSize);
    const reductionFormatted = r.reductionPercent > 0 ? `${formatBytes(r.reduction)} (-${r.reductionPercent.toFixed(1)}%)` : 'N/A';
    const statusDisplay = r.error ? `Error: ${r.error.split('\n')[0]}` : r.status; // Show first line of error

    // Apply path collapsing for display
    const fileDisplay = collapsePathForDisplay(r.filePath);
    const outputFileDisplay = collapsePathForDisplay(r.outputFilePath || 'N/A');

    let sourceMapDisplay = 'No';
    if (r.sourceMapGenerated) {
        // Construct the actual source map path from result and then collapse
        // This assumes sourceMapActualFilePath was set correctly in processFile
        // For simplicity here, we'll just collapse based on the knowledge that it's usually relative to cwd
        // If not directly available in 'r', you might need to re-derive it or ensure it's stored.
        // For now, let's assume `r.sourceMapPath` exists if generated and is the relative path.
        // If `r.sourceMapActualFilePath` were part of the result, that would be ideal.
        // For this example, we'll just indicate "Yes" for brevity or extend 'r' in `processFile`
        // if you need the full path to collapse.
        // Let's use a placeholder 'Yes' or if you decide to add `sourceMapActualFilePath` to result:
        // sourceMapDisplay = collapsePathForDisplay(r.sourceMapActualFilePath);
        sourceMapDisplay = 'Yes'; // Keeping it simple as per original 'Yes'/'No', but could be collapsed path if stored
        // To collapse the source map path, you'd need the actual path returned in `result` from `processFile`.
        // Assuming you might add `sourceMapPath: path.relative(process.cwd(), sourceMapActualFilePath)` to the result object in `processFile`.
        if (r.sourceMapPath) { // If you add this to your result object in processFile
            sourceMapDisplay = collapsePathForDisplay(r.sourceMapPath);
        } else {
             // If sourceMapPath isn't directly in `r`, we'd need to reconstruct or just show 'Yes'
             sourceMapDisplay = 'Yes'; // Or handle more robustly
        }
    }


    return {
      file: fileDisplay,
      status: statusDisplay,
      originalSize: originalSizeFormatted,
      minifiedSize: minifiedSizeFormatted,
      reduction: reductionFormatted,
      outputFile: outputFileDisplay,
      sourceMap: sourceMapDisplay,
    };
  });

  formattedResults.forEach(row => {
    maxWidths[0] = Math.max(maxWidths[0], row.file.length);
    maxWidths[1] = Math.max(maxWidths[1], row.status.length);
    maxWidths[2] = Math.max(maxWidths[2], row.originalSize.length);
    maxWidths[3] = Math.max(maxWidths[3], row.minifiedSize.length);
    maxWidths[4] = Math.max(maxWidths[4], row.reduction.length);
    maxWidths[5] = Math.max(maxWidths[5], row.outputFile.length);
    maxWidths[6] = Math.max(maxWidths[6], row.sourceMap.length);
  });

  // Print header
  const headerLine = headers.map((header, i) => header.padEnd(maxWidths[i])).join(' | ');
  console.log(headerLine);
  console.log('-'.repeat(headerLine.length));

  // Print rows
  formattedResults.forEach(row => {
    const rowLine = `${row.file.padEnd(maxWidths[0])} | ` +
                    `${row.status.padEnd(maxWidths[1])} | ` +
                    `${row.originalSize.padEnd(maxWidths[2])} | ` +
                    `${row.minifiedSize.padEnd(maxWidths[3])} | ` +
                    `${row.reduction.padEnd(maxWidths[4])} | ` +
                    `${row.outputFile.padEnd(maxWidths[5])} | ` +
                    `${row.sourceMap.padEnd(maxWidths[6])}`;
    console.log(rowLine);
  });

  // Optional: Print a summary line at the end
  const totalOriginalSize = results.reduce((sum, r) => sum + r.originalSize, 0);
  const totalMinifiedSize = results.reduce((sum, r) => sum + r.minifiedSize, 0);
  const totalReduction = totalOriginalSize - totalMinifiedSize;
  const totalReductionPercent = totalOriginalSize > 0 ? (totalReduction / totalOriginalSize * 100).toFixed(1) : 0;

  console.log('-'.repeat(headerLine.length));
  console.log(`Total: ${formatBytes(totalOriginalSize)} -> ${formatBytes(totalMinifiedSize)} (Saved: ${formatBytes(totalReduction)}, -${totalReductionPercent}%)`);
  console.log('--- End Summary ---');
}


module.exports = {
  traverseAndMinifyDirectory: async (directory, options) => {
    // Clear the console before starting if desired, to make real-time logs more prominent
    // console.clear(); // Uncomment this line if you want to clear the console first

    const results = [];
    await traverseAndMinifyDirectory(directory, options, results);
    displayResultsTable(results); // The table will be displayed after all individual logs
    return results;
  },
  processFile,
  isIgnored
};
