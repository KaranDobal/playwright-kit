import fs from "node:fs";
import path from "node:path";

import type { Expect, TestType } from "@playwright/test";

type AnyFixtures = object;
type AnyTestType = TestType<AnyFixtures, AnyFixtures>;
type AnyExpect = Expect<unknown>;

export interface CreateAuthTestOptions {
  statesDir?: string;
  defaultProfile?: string;
  baseTest?: AnyTestType;
  baseExpect?: AnyExpect;
}

type PlaywrightTestFn = (...args: unknown[]) => unknown;

export type AuthTest = AnyTestType & {
  withAuth(profile?: string): AnyTestType;
  auth(profile: string, title: string, fn: PlaywrightTestFn): void;
  auth(title: string, fn: PlaywrightTestFn): void;
};

export type AuthTestWithExpect = AuthTest & { expect: AnyExpect };

function resolveStatePath(options: { statesDir: string; profile: string }): string {
  const dir = path.isAbsolute(options.statesDir)
    ? options.statesDir
    : path.resolve(process.cwd(), options.statesDir);
  return path.join(dir, `${options.profile}.json`);
}

function assertStateFileReadable(statePath: string, profile: string): void {
  if (!fs.existsSync(statePath)) {
    throw new Error(
      `Missing auth state for profile "${profile}" at "${statePath}". Run: playwright-kit auth setup --profile ${profile} (or playwright-kit auth ensure).`,
    );
  }

  try {
    const raw = fs.readFileSync(statePath, "utf8");
    JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Invalid auth state JSON for profile "${profile}" at "${statePath}": ${message}`,
    );
  }
}

function loadPlaywrightTestModule(): typeof import("@playwright/test") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("@playwright/test") as typeof import("@playwright/test");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `@playwright-kit/auth wrapper requires @playwright/test to be installed (peer dependency). ${message}`,
    );
  }
}

export interface AuthTestOptions {
  /** Directory containing `<profile>.json`; default `.auth` relative to `process.cwd()`. */
  statesDir?: string;
  /** Alias for statesDir (kept for ergonomics). */
  stateDir?: string;
  defaultProfile: string;
  baseTest?: AnyTestType;
  baseExpect?: AnyExpect;
}

export function authTest(options: AuthTestOptions): AuthTestWithExpect {
  const loaded = loadPlaywrightTestModule();
  const baseTest = options.baseTest ?? loaded.test;
  const expect = options.baseExpect ?? loaded.expect;

  const statesDir = options.statesDir ?? options.stateDir ?? ".auth";
  const defaultProfile = options.defaultProfile;

  const testBase = baseTest.extend<{
    auth: string;
    _authStatePath: string;
  }>({
    auth: [defaultProfile, { option: true }],
    _authStatePath: async (
      { auth }: { auth: string },
      use: (value: string) => Promise<void>,
    ) => {
      if (!auth) {
        throw new Error(
          `No auth profile selected. Set defaultProfile in authTest({ defaultProfile }) or use test.use({ auth: "<profile>" }).`,
        );
      }
      const statePath = resolveStatePath({ statesDir, profile: auth });
      assertStateFileReadable(statePath, auth);
      await use(statePath);
    },
    // Override Playwright's built-in `storageState` option fixture so role switching
    // composes with existing `test.use({ ...contextOptions })` patterns.
    storageState: async (
      { _authStatePath }: { _authStatePath: string },
      use: (value: string) => Promise<void>,
    ) => {
      await use(_authStatePath);
    },
  } as unknown as Parameters<typeof baseTest.extend>[0]);

  const withAuth = (profile?: string): AnyTestType => {
    const selectedProfile = profile ?? defaultProfile;
    const derived = testBase.extend({});
    derived.use({ auth: selectedProfile });
    return derived as unknown as AnyTestType;
  };

  const auth: AuthTest["auth"] = (
    a: string,
    b: string | PlaywrightTestFn,
    c?: PlaywrightTestFn,
  ) => {
    if (typeof b === "function") {
      const title = a;
      const fn = b;
      (testBase as unknown as (title: string, fn: PlaywrightTestFn) => void)(title, fn);
      return;
    }

    const profile = a;
    const title = b;
    const fn = c;
    if (!fn) {
      throw new Error(`test.auth(profile, title, fn) requires a test function.`);
    }
    const derived = testBase.extend({});
    derived.use({ auth: profile });
    (derived as unknown as (title: string, fn: PlaywrightTestFn) => void)(title, fn);
  };

  const test = testBase as unknown as AuthTestWithExpect;
  test.withAuth = withAuth;
  test.auth = auth;
  test.expect = expect;
  return test;
}

export function createAuthTest(options: CreateAuthTestOptions = {}): {
  test: AuthTest;
  expect: AnyExpect;
} {
  let baseTest = options.baseTest;
  let baseExpect = options.baseExpect;

  if (!baseTest || !baseExpect) {
    const loaded = loadPlaywrightTestModule();
    baseTest = baseTest ?? loaded.test;
    baseExpect = baseExpect ?? loaded.expect;
  }

  const defaultProfile = options.defaultProfile;
  if (!defaultProfile) {
    throw new Error(
      `createAuthTest() requires "defaultProfile" (pass { defaultProfile: "<profile>" }).`,
    );
  }

  const test = authTest({
    defaultProfile,
    statesDir: options.statesDir,
    baseTest,
    baseExpect,
  });

  return { test, expect: test.expect };
}
