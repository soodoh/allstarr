import { registerTask } from "../registry";
import { refreshDownloads } from "../../download-manager";
import { eventBus } from "../../event-bus";
import { rescheduleTask } from "../timers";

const INTERVAL_NO_CLIENTS = 60_000;
const INTERVAL_IDLE = 15_000;
const INTERVAL_ACTIVE = 4000;

let currentInterval = INTERVAL_NO_CLIENTS;

function getTargetInterval(hasActiveDownloads: boolean): number {
  const clientCount = eventBus.getClientCount();
  if (clientCount === 0) {
    return INTERVAL_NO_CLIENTS;
  }
  return hasActiveDownloads ? INTERVAL_ACTIVE : INTERVAL_IDLE;
}

async function adaptiveRefreshDownloads() {
  const result = await refreshDownloads();

  // Determine if there are active downloads — use structured check, not string matching
  const hasActiveDownloads =
    result.success && result.message !== "No active tracked downloads";
  const targetInterval = getTargetInterval(hasActiveDownloads);

  if (targetInterval !== currentInterval) {
    currentInterval = targetInterval;
    rescheduleTask("refresh-downloads", currentInterval);
  }

  return result;
}

registerTask({
  id: "refresh-downloads",
  name: "Refresh Downloads",
  description:
    "Check download clients for status changes and import completed downloads",
  defaultInterval: 60,
  handler: adaptiveRefreshDownloads,
});
