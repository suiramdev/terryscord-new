const LINT_STAGED_GLOB = "*.{js,jsx,ts,tsx,json,jsonc,css,scss,md,mdx}";
const IGNORED_LINT_STAGED_FILES = new Set(["apps/web/src/routeTree.gen.ts"]);

const formatFilesForCommand = (files) =>
  files.map((file) => JSON.stringify(file)).join(" ");

export default {
  [LINT_STAGED_GLOB]: (files) => {
    const filteredFiles = files.filter(
      (file) => !IGNORED_LINT_STAGED_FILES.has(file)
    );

    if (filteredFiles.length === 0) {
      return [];
    }

    return [`bun x ultracite fix ${formatFilesForCommand(filteredFiles)}`];
  },
};
