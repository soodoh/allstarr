import { resolve } from "node:path";
import { promoteComposeLiveFixtures } from "../e2e/fixtures/golden/promote";

promoteComposeLiveFixtures({
	captureRoot: resolve(process.cwd(), "e2e/fixtures/golden/_captures/live-compose"),
	serviceRoot: resolve(process.cwd(), "e2e/fixtures/golden/services"),
});
