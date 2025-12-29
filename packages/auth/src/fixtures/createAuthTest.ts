import fs from "node:fs";
import path from "node:path";

import { expect as playwrightExpect, test as playwrightTest } from "@playwright/test";
import type {
  Expect,
  PlaywrightTestArgs,
  PlaywrightTestOptions,
  PlaywrightWorkerArgs,
  PlaywrightWorkerOptions,
  TestType,
} from "@playwright/test";

type AnyTestType = TestType<object, object>;
type AnyExpect = Expect<unknown>;

type DefaultBaseTest = TestType<
  PlaywrightTestArgs & PlaywrightTestOptions,
  PlaywrightWorkerArgs & PlaywrightWorkerOptions
>;
type DefaultExpect = typeof playwrightExpect;

type BaseTestArgs<TBaseTest extends AnyTestType> = TBaseTest extends TestType<infer TArgs, object>
  ? TArgs
  : never;
type BaseWorkerArgs<TBaseTest extends AnyTestType> = TBaseTest extends TestType<object, infer TArgs>
  ? TArgs
  : never;
type StorageStateOption<TBaseTest extends AnyTestType> = BaseTestArgs<TBaseTest> extends {
  storageState?: infer T;
}
  ? T
  : unknown;

export interface CreateAuthTestOptions<
  TBaseTest extends AnyTestType = DefaultBaseTest,
  TBaseExpect extends AnyExpect = DefaultExpect,
> {
  statesDir?: string;
  defaultProfile?: string;
  baseTest?: TBaseTest;
  baseExpect?: TBaseExpect;
}

type PlaywrightTestFn = (...args: unknown[]) => unknown;

type AuthFixtures<TBaseTest extends AnyTestType> = {
  auth: string;
  _authStatePath: string;
  storageState: StorageStateOption<TBaseTest>;
};

type AuthWrappedTest<TBaseTest extends AnyTestType> = TestType<
  BaseTestArgs<TBaseTest> & AuthFixtures<TBaseTest>,
  BaseWorkerArgs<TBaseTest>
>;

export type AuthTest<TBaseTest extends AnyTestType = DefaultBaseTest> = AuthWrappedTest<TBaseTest> & {
  withAuth(profile?: string): AuthWrappedTest<TBaseTest>;
  auth(profile: string, title: string, fn: PlaywrightTestFn): void;
  auth(title: string, fn: PlaywrightTestFn): void;
};

export type AuthTestWithExpect<
  TBaseTest extends AnyTestType = DefaultBaseTest,
  TBaseExpect extends AnyExpect = DefaultExpect,
> = AuthTest<TBaseTest> & { expect: TBaseExpect };

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

export interface AuthTestOptions<
  TBaseTest extends AnyTestType = DefaultBaseTest,
  TBaseExpect extends AnyExpect = DefaultExpect,
> {
  /** Directory containing `<profile>.json`; default `.auth` relative to `process.cwd()`. */
  statesDir?: string;
  /** Alias for statesDir (kept for ergonomics). */
  stateDir?: string;
  defaultProfile: string;
  baseTest?: TBaseTest;
  baseExpect?: TBaseExpect;
}

export function authTest<
  TBaseTest extends AnyTestType = DefaultBaseTest,
  TBaseExpect extends AnyExpect = DefaultExpect,
>(options: AuthTestOptions<TBaseTest, TBaseExpect>): AuthTestWithExpect<TBaseTest, TBaseExpect> {
  const baseTest = (options.baseTest ?? (playwrightTest as unknown as TBaseTest)) as TBaseTest;
  const expect = (options.baseExpect ?? (playwrightExpect as unknown as TBaseExpect)) as TBaseExpect;

  const statesDir = options.statesDir ?? options.stateDir ?? ".auth";
  const defaultProfile = options.defaultProfile;

  const authOption: [string, { option: true }] = [defaultProfile, { option: true }];

  const fixtures = {
    auth: authOption,
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
      use: (value: StorageStateOption<TBaseTest>) => Promise<void>,
    ) => {
      await use(_authStatePath as StorageStateOption<TBaseTest>);
    },
  } satisfies Parameters<TBaseTest["extend"]>[0];

  const testBase = baseTest.extend<AuthFixtures<TBaseTest>>(fixtures);

  const withAuth = (profile?: string): AuthWrappedTest<TBaseTest> => {
    const selectedProfile = profile ?? defaultProfile;
    const derived = testBase.extend({});
    derived.use({ auth: selectedProfile });
    return derived as unknown as AuthWrappedTest<TBaseTest>;
  };

  const auth: AuthTest<TBaseTest>["auth"] = (
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

  const test = testBase as unknown as AuthTestWithExpect<TBaseTest, TBaseExpect>;
  test.withAuth = withAuth;
  test.auth = auth;
  test.expect = expect;
  return test;
}

export function createAuthTest<
  TBaseTest extends AnyTestType = DefaultBaseTest,
  TBaseExpect extends AnyExpect = DefaultExpect,
>(options: CreateAuthTestOptions<TBaseTest, TBaseExpect> = {}): {
  test: AuthTest<TBaseTest>;
  expect: TBaseExpect;
} {
  let baseTest = options.baseTest;
  let baseExpect = options.baseExpect;

  if (!baseTest || !baseExpect) {
    baseTest = (baseTest ?? (playwrightTest as unknown as TBaseTest)) as TBaseTest;
    baseExpect = (baseExpect ?? (playwrightExpect as unknown as TBaseExpect)) as TBaseExpect;
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

  return { test, expect: test.expect as TBaseExpect };
}
