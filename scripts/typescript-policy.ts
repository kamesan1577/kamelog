// Migrating legacy first-party JavaScript may be edited until replaced, but new
// first-party implementation files must use TypeScript. Vendored code is external.
export function isNewJavaScriptSource(filePath: string): boolean {
  const isVendor = filePath.startsWith("vendor/");
  const isJavaScript = /\.(?:js|jsx|mjs|cjs)$/i.test(filePath);
  return !isVendor && isJavaScript;
}
