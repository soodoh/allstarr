import { registerTask } from "../registry";
import { refreshDownloads } from "../../download-manager";

registerTask({
  id: "refresh-downloads",
  name: "Refresh Downloads",
  description:
    "Check download clients for status changes and import completed downloads",
  defaultInterval: 60,
  handler: refreshDownloads,
});
