import type { AuthConfigLoadResult } from "../../config/types";
import { setupProfileState } from "../../runner/setupProfileState";
import { createUserError } from "../../internal/userError";
import { resolveStatesDir } from "../../state/paths";
import { withProfileLock } from "../../state/lock";

export async function authSetup(options: {
  loaded: AuthConfigLoadResult;
  profileName: string;
  headed: boolean;
  browserName?: "chromium" | "firefox" | "webkit";
  env: NodeJS.ProcessEnv;
}): Promise<{ statePath: string }> {
  const profile = options.loaded.config.profiles[options.profileName];
  if (!profile) {
    const available = Object.keys(options.loaded.config.profiles).sort().join(", ");
    throw createUserError(
      `Unknown profile "${options.profileName}". Available profiles: ${available}.`,
    );
  }

  const statesDir = resolveStatesDir({
    projectRoot: options.loaded.projectRoot,
    statesDir: options.loaded.config.statesDir,
  });

  if (!profile.validateUrl && !options.loaded.config.validateUrl) {
    console.log(
      `auth setup: warning: "${options.profileName}" has no validateUrl; defaulting to "/" (set validateUrl to make validation deterministic).`,
    );
  }

  return withProfileLock({ statesDir, profile: options.profileName }, () =>
    setupProfileState({
      config: options.loaded.config,
      projectRoot: options.loaded.projectRoot,
      profileName: options.profileName,
      profile,
      headed: options.headed,
      env: options.env,
      browserName: options.browserName,
    }),
  );
}
