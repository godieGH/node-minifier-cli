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
    // If the path is a file within an ignored directory, it also should be ignored.
    if (minimatch(normalizedPath, normalizedPattern, { dot: true })) {
      return true;
    }

    // This block handles patterns that specifically target directories and ensures their contents are ignored.
    if (minimatch(normalizedPath + (path.sep === '\\' ? '\\' : '/') + '**', normalizedPattern + (path.sep === '\\' ? '\\' : '/') + '**', { dot: true })) {
        return true;
    }
  }
  return false;
}

async function processFile(filePath, options) {
  const ext = path.extname(filePath).toLowerCase();
  let content;
  const fileName = path.basename(filePath);
  const dirName = path.dirname(filePath);
  const relativeFilePath = path.relative(process.cwd(), filePath);

  if (options.ignorePatterns && isIgnored(filePath, options.ignorePatterns, options.basePath)) {
    console.log(`Ignoring (matches ignore pattern): ${relativeFilePath}`);
    return;
  }

  try {
    content = await fs.readFile(filePath, 'utf8');
  } catch (readError) {
    console.error(`Failed to read file ${relativeFilePath}: ${readError.message}`);
    return;
  }

  let minifiedContent = content;
  let minified = false;
  let sourceMapContent = null;

  // Define where the source map will actually be saved
  let sourceMapTargetDir = dirName;
  if (options.sourceMapDir) {
    sourceMapTargetDir = path.resolve(dirName, options.sourceMapDir);
  }
  const sourceMapActualFilePath = path.join(sourceMapTargetDir, `${fileName}.map`);

  // Calculate the URL for the source map relative to the minified file
  // This is what goes into the `sourceMappingURL` comment inside the minified file
  const sourceMapUrlRelativeFromMinifiedFile = path.relative(dirName, sourceMapActualFilePath).replace(/\\/g, '/');


  try {
    if (ext === '.js') {
      const terserOptions = {
        compress: {
          drop_console: options.dropConsole,
        },
        mangle: options.mangle,
      };

      if (options.sourceMap) {
        terserOptions.sourceMap = {
          filename: fileName, // The name of the minified file itself
          url: sourceMapUrlRelativeFromMinifiedFile, // This influences the comment Terser appends
        };
      }

      // Remove any existing sourceMappingURL comments from the input content
      // and trim any leading/trailing whitespace after removal.
      const cleanedContent = content.replace(/\/\/# sourceMappingURL=.*$/gm, '').trim();

      const result = await terserMinify({ [fileName]: cleanedContent }, terserOptions);

      if (result.error) {
        throw result.error;
      }
      minifiedContent = result.code; // Terser's output already includes the sourceMappingURL comment if sourceMap is true
      minified = true;

      if (options.sourceMap && result.map) {
        let terserMapObject = result.map;
        if (typeof result.map === 'string') {
            try {
                terserMapObject = JSON.parse(result.map);
            } catch (parseError) {
                console.error(`Error parsing Terser source map for ${relativeFilePath}: ${parseError.message}. Source map not generated.`);
                return;
            }
        }

        // CRITICAL FIX FOR JAVASCRIPT SOURCE MAPS: Ensure sourcesContent is present
        // and uses the cleaned original content.
        if (!terserMapObject.sourcesContent || terserMapObject.sourcesContent.length === 0) {
            terserMapObject.sourcesContent = [cleanedContent];
        }

        sourceMapContent = terserMapObject;
        // DO NOT append sourceMappingURL here for JS, Terser already does it.
      }

    } else if (ext === '.css') {
      const postcssOptions = {
        from: filePath,
        to: filePath,
      };

      if (options.sourceMap) {
        postcssOptions.map = {
          inline: false,
          annotation: sourceMapUrlRelativeFromMinifiedFile, // This influences the comment PostCSS appends
          sourcesContent: true,
        };
      }

      // Remove any existing sourceMappingURL comments and @charset directives from the input content
      const cleanedContent = content.replace(/\/\*# sourceMappingURL=.*?\*\/|@charset\s+["'].*?["'];?/g, '').trim();

      const result = await postcss([cssnano]).process(cleanedContent, postcssOptions);
      minifiedContent = result.css;
      minified = true;

      if (options.sourceMap && result.map) {
        sourceMapContent = result.map.toString();
        // PostCSS (cssnano) does NOT automatically append the sourceMappingURL comment, so we add it.
        minifiedContent += `\n/*# sourceMappingURL=${sourceMapUrlRelativeFromMinifiedFile} */`;
      }

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
      console.log(`Minified and overwritten: ${relativeFilePath}`);

      if (options.sourceMap && sourceMapContent) {
        // Ensure the target directory for the source map exists
        await fs.mkdir(sourceMapTargetDir, { recursive: true });

        let mapContentToWrite;
        if (typeof sourceMapContent === 'object') {
            mapContentToWrite = JSON.stringify(sourceMapContent, null, 2);
        } else if (typeof sourceMapContent === 'string') {
            mapContentToWrite = sourceMapContent;
        } else {
            console.error(`Unexpected sourceMapContent type for ${relativeFilePath}. Source map not written.`);
            return;
        }

        await fs.writeFile(sourceMapActualFilePath, mapContentToWrite, 'utf8');
        console.log(`Source map generated: ${path.relative(process.cwd(), sourceMapActualFilePath)}`);
      }
    } else {
      console.log(`Skipping (no minification applied): ${relativeFilePath}`);
    }

  } catch (minifyError) {
    console.error(`Error minifying ${relativeFilePath}: ${minifyError.message}`);
    // Optionally log stack trace for deeper debugging, but keep it clean by default
    // if (minifyError.stack) {
    //     console.error(`Stack trace:\n${minifyError.stack}`);
    // }
  }
}

async function traverseAndMinifyDirectory(directory, options) {
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

module.exports = { traverseAndMinifyDirectory, processFile, isIgnored };
