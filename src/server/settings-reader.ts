import { getSettingValue } from "./settings-store";

export default function getMediaSetting<T>(key: string, defaultValue: T): T {
	return getSettingValue(key, defaultValue);
}
