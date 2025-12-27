import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { withProfileLock } from "../state/lock";
import { isUserError } from "../internal/userError";

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "playwright-kit-auth-lock-"));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("withProfileLock serializes access per profile", async () => {
  const statesDir = await makeTempDir();
  const profile = "admin";

  const events: Array<{ name: string; t: number }> = [];

  const first = withProfileLock({ statesDir, profile }, async () => {
    events.push({ name: "first-enter", t: Date.now() });
    await sleep(350);
    events.push({ name: "first-exit", t: Date.now() });
  });

  await sleep(50);

  const second = withProfileLock({ statesDir, profile }, async () => {
    events.push({ name: "second-enter", t: Date.now() });
    events.push({ name: "second-exit", t: Date.now() });
  });

  await Promise.all([first, second]);

  const firstEnter = events.find((e) => e.name === "first-enter");
  const firstExit = events.find((e) => e.name === "first-exit");
  const secondEnter = events.find((e) => e.name === "second-enter");

  assert.ok(firstEnter, `missing first-enter event: ${JSON.stringify(events)}`);
  assert.ok(firstExit, `missing first-exit event: ${JSON.stringify(events)}`);
  assert.ok(secondEnter, `missing second-enter event: ${JSON.stringify(events)}`);

  assert.ok(firstEnter.t <= firstExit.t);
  assert.ok(
    secondEnter.t >= firstExit.t,
    `expected second to enter after first exit, got events: ${JSON.stringify(events)}`,
  );

  const lockPath = path.join(statesDir, ".locks", `${profile}.lock`);
  await assert.rejects(
    () => fs.access(lockPath),
    () => true,
  );
});

test("withProfileLock times out when lock is held", async () => {
  const statesDir = await makeTempDir();
  const profile = "admin";

  const locksDir = path.join(statesDir, ".locks");
  await fs.mkdir(locksDir, { recursive: true });
  await fs.writeFile(path.join(locksDir, `${profile}.lock`), "held", "utf8");

  await assert.rejects(
    () => withProfileLock({ statesDir, profile, timeoutMs: 200 }, async () => undefined),
    (error) => isUserError(error),
  );
});
