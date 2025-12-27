import type { LaunchOptions } from "playwright";

import type { AuthConfig, AuthProfileConfig } from "../config/types";

export function mergeLaunchOptions(options: {
  config: AuthConfig;
  profile: AuthProfileConfig;
  headed: boolean;
}): LaunchOptions {
  return Object.assign({}, options.config.launchOptions, options.profile.launchOptions, {
    headless: !options.headed,
  });
}
