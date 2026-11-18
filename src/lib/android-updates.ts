import { Browser } from "@capacitor/browser";
import { Capacitor, registerPlugin } from "@capacitor/core";

export type AndroidVersion = { code: number; name: string };

const updater = registerPlugin<{
  getVersion(): Promise<AndroidVersion>;
  install(version: AndroidVersion): Promise<{ state: "permission" | "installer" }>;
}>("AndroidUpdater");

export function androidUpdatePlatform() {
  if (Capacitor.getPlatform() !== "android") return null;
  return Capacitor.isPluginAvailable("AndroidUpdater") ? "native" : "legacy";
}

export const installedAndroidVersion = () => updater.getVersion();
export const installAndroidUpdate = (version: AndroidVersion) => updater.install(version);

export async function latestAndroidVersion(): Promise<AndroidVersion | null> {
  const response = await fetch("/api/android-update");
  if (!response.ok) throw new Error("Update check failed");
  return response.json();
}

export async function downloadAndroidUpdater() {
  const url = "https://github.com/baranaikooo/Antidote.app/releases/download/v1.0.0-alpha/Antidote-debug.apk";
  await Browser.open({ url });
}
