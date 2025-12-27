import test from "node:test";
import assert from "node:assert/strict";

import { resolveProfileCredentials } from "../credentials/resolveCredentials";
import { isUserError } from "../internal/userError";
import type { AuthConfig, AuthProfileConfig } from "../config/types";

test("resolveProfileCredentials uses AUTH_<PROFILE>_EMAIL/PASSWORD", () => {
  const creds = resolveProfileCredentials({
    profileName: "qa-admin",
    profile: {} as unknown as AuthProfileConfig,
    config: { profiles: {} } as unknown as AuthConfig,
    env: {
      AUTH_QA_ADMIN_EMAIL: "qa@example.com",
      AUTH_QA_ADMIN_PASSWORD: "secret",
    },
  });

  assert.equal(creds.email, "qa@example.com");
  assert.equal(creds.password, "secret");
});

test("resolveProfileCredentials throws a user error when missing env vars", () => {
  assert.throws(
    () =>
      resolveProfileCredentials({
        profileName: "admin",
        profile: {} as unknown as AuthProfileConfig,
        config: { profiles: {} } as unknown as AuthConfig,
        env: {},
      }),
    (error) => isUserError(error),
  );
});
