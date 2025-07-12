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
 */
async function processFile(filePath, options) {
  const ext = path.extname(filePath).toLowerCase();
  const fileName = path.basename(filePath);
  const dirName = path.dirname(filePath);
  const relativeFilePath = path.relative(process.cwd(), filePath);


  if (options.ignorePatterns && isIgnored(filePath, options.ignorePatterns, options.basePath)) {
    if (options.verbose) console.log(`Ignoring (matches pattern): ${relativeFilePath}`);
    return;
  }

  let originalContent;
  try {
    originalContent = await fs.readFile(filePath, 'utf8');
  } catch (readError) {
    console.error(`Failed to read file ${relativeFilePath}: ${readError.message}`);
    return;
  }

  const originalSize = Buffer.byteLength(originalContent, 'utf8');

  
  let minifiedContent = originalContent;
  let minified = false;
  let sourceMapContent = null;

  // --- ADD THIS BLOCK: Determine output file path and renaming ---
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
  // --- END ADD BLOCK ---

  // --- REPLACE THIS BLOCK: Source Map Path Calculation ---
  const sourceMapTargetDir = options.sourceMapDir
    ? path.resolve(dirName, options.sourceMapDir)
    : (options.outputDir ? path.dirname(outputFilePath) : dirName); // Adjusted source map dir

  const sourceMapActualFilePath = path.join(sourceMapTargetDir, `${path.basename(outputFilePath)}.map`); // Source map name based on output file
  const sourceMapUrlRelativeFromMinifiedFile = path.relative(path.dirname(outputFilePath), sourceMapActualFilePath).replace(/\\/g, '/');
  // --- END REPLACE BLOCK ---

  try {
    const cleanedContent = originalContent.replace(/\/\/[#@]\s*sourceMappingURL=.*$/gm, '').replace(/\/\*#\s*sourceMappingURL=.*?\*\//g, '').trim();

    if (ext === '.js') {
      const terserOptions = {
        compress: { drop_console: options.dropConsole },
        mangle: options.mangle,
        sourceMap: options.sourceMap ? {
          filename: path.basename(outputFilePath), // MODIFIED: Use output file name for source map
          url: sourceMapUrlRelativeFromMinifiedFile,
        } : false,
      };
      const result = await terserMinify({ [fileName]: cleanedContent }, terserOptions);
      if (result.error) throw result.error;

      minifiedContent = result.code;
      minified = true;
      if (options.sourceMap && result.map) {
        const mapObject = JSON.parse(result.map);
        if (!mapObject.sourcesContent || mapObject.sourcesContent.length === 0) {
            mapObject.sourcesContent = [cleanedContent];
        }
        sourceMapContent = JSON.stringify(mapObject);
      }
    } else if (ext === '.css') {
      const postcssOptions = {
        from: filePath,
        to: outputFilePath, // MODIFIED: Use output file path as 'to' for postcss
        map: options.sourceMap ? {
          inline: false,
          annotation: sourceMapUrlRelativeFromMinifiedFile,
          sourcesContent: true,
        } : false,
      };
      const result = await postcss([cssnano]).process(cleanedContent, postcssOptions);
      minifiedContent = result.css;
      minified = true;
      if (options.sourceMap && result.map) {
        sourceMapContent = result.map.toString();
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
      const minifiedSize = Buffer.byteLength(minifiedContent, 'utf8');
      const reduction = originalSize - minifiedSize;
      const reductionPercent = originalSize > 0 ? (reduction / originalSize * 100).toFixed(1) : 0;
      const sizeReport = `(${formatBytes(originalSize)} -> ${formatBytes(minifiedSize)}, -${reductionPercent}%)`;

      // --- REPLACE THIS BLOCK: Dry Run and Actual Write Messages ---
      if (options.dryRun) {
        console.log(`[DRY RUN] Would minify ${relativeFilePath} to ${path.relative(process.cwd(), outputFilePath)} ${sizeReport}`);
        if (options.sourceMap && sourceMapContent) {
            console.log(`[DRY RUN]   + Would generate source map: ${path.relative(process.cwd(), sourceMapActualFilePath)}`);
        }
      } else {
        await fs.writeFile(outputFilePath, minifiedContent, 'utf8'); // Write to outputFilePath
        console.log(`Minified: ${relativeFilePath} -> ${path.relative(process.cwd(), outputFilePath)} ${sizeReport}`);
        
        if (options.sourceMap && sourceMapContent) {
          await fs.mkdir(sourceMapTargetDir, { recursive: true });
          await fs.writeFile(sourceMapActualFilePath, sourceMapContent, 'utf8');
          console.log(`Source map generated: ${path.relative(process.cwd(), sourceMapActualFilePath)}`);
        }
      }
      // --- END REPLACE BLOCK ---
    } else {
      if (options.verbose) console.log(`Skipping (no changes after minification): ${relativeFilePath}`);
    }

  } catch (minifyError) {
    console.error(`\nError minifying ${relativeFilePath}:\n${minifyError.message}`);
  }
}

/**
 * Recursively traverses a directory and processes files.
 * @param {string} directory The directory to traverse.
 * @param {object} options The minifier options.
 */
async function traverseAndMinifyDirectory(directory, options) {
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
      await traverseAndMinifyDirectory(filePath, options);
    } else {
      const ext = path.extname(filePath).toLowerCase();
      if (['.js', '.css', '.html'].includes(ext)) {
        await processFile(filePath, options);
      }
    }
  }
}

module.exports = { traverseAndMinifyDirectory, processFile, isIgnored };

