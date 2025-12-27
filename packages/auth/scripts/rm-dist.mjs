import fs from "node:fs/promises";

async function exists(path) {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

const target = new URL("../dist", import.meta.url);

let removed = false;
for (let attempt = 1; attempt <= 5; attempt++) {
  try {
    await fs.rm(target, { recursive: true, force: true });
    if (!(await exists(target))) {
      removed = true;
      break;
    }
  } catch {
    // ignore and retry
  }
  await new Promise((r) => setTimeout(r, 150 * attempt));
}

// Final attempt with an explicit error.
if (!removed) {
  await fs.rm(target, { recursive: true, force: true });
}
