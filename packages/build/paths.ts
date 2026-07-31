/** Where generated output lands: the repo root, not inside a package. */

import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
export const RENDERED_DIR = join(REPO_ROOT, "rendered");
