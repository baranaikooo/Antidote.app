import { Browser } from "@capacitor/browser";
import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export type AndroidVersion = { code: number; name: string };
export type AndroidUpdateProgress = { stage: "preparing" | "permission" | "downloading" | "verifying"; received?: number; total?: number };

const updater = registerPlugin<{
  getVersion(): Promise<AndroidVersion>;
  addListener(event: "downloadProgress", listener: (progress: AndroidUpdateProgress) => void): Promise<PluginListenerHandle>;
  install(version: AndroidVersion): Promise<{ state: "permission" | "installer" }>;
}>("AndroidUpdater");

export function androidUpdatePlatform() {
  if (Capacitor.getPlatform() !== "android") return null;
  return Capacitor.isPluginAvailable("AndroidUpdater") ? "native" : "legacy";
}

export const installedAndroidVersion = () => updater.getVersion();
export async function installAndroidUpdate(
  version: AndroidVersion,
  onProgress: (progress: AndroidUpdateProgress) => void,
) {
  const listener = await updater.addListener("downloadProgress", onProgress).catch(() => undefined);
  try {
    return await updater.install(version);
  } finally {
    void listener?.remove().catch(() => {});
  }
}

export async function latestAndroidVersion(): Promise<AndroidVersion | null> {
  const response = await fetch("/api/android-update");
  if (!response.ok) throw new Error("Update check failed");
  return response.json();
}

export async function downloadAndroidUpdater() {
  const url = "https://github.com/baranaikooo/Antidote.app/releases/download/v1.0.0-alpha/Antidote-debug.apk";
  await Browser.open({ url });
}
