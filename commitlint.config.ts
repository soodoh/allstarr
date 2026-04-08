import { RuleConfigSeverity } from "@commitlint/types";
import type { UserConfig } from "@commitlint/types";

const Configuration: UserConfig = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-empty": [RuleConfigSeverity.Error, "never"],
  },
};

export default Configuration;
