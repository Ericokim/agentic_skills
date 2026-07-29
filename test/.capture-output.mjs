// Shared test helper: swallow a command's stdout while it runs.
//
// Commands write straight to process.stdout through ui.mjs. Under node --test,
// letting that reach the real stdout races with the runner's own child to
// parent reporting channel, and the file is intermittently reported as an
// uncaught exception unrelated to any assertion. Redirecting stdout for the
// duration of the call avoids the race. Named with a leading dot, and not
// *.test.mjs, so node --test does not also try to run this file itself.

/** Run a function while capturing everything it writes to stdout. */
export async function captureOutput(fn) {
  const original = process.stdout.write.bind(process.stdout);
  let output = '';
  process.stdout.write = (chunk) => {
    output += chunk;
    return true;
  };
  try {
    const result = await fn();
    return { result, output };
  } finally {
    process.stdout.write = original;
  }
}
