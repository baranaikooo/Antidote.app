import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { supabase } from "./supabase";

const AppChrome = registerPlugin<{
  hasFirebaseMessaging(): Promise<{ available: boolean; supportsChannels: boolean }>;
}>("AppChrome");
const choiceKey = (userId: string) => `antidote:voice-alerts:${userId}`;
const channelId = "voice-replies";
let registration: Promise<void> | undefined;

export function saveVoiceAlertChoice(userId: string, choice: "enabled" | "dismissed") {
  try {
    localStorage.setItem(choiceKey(userId), choice);
  } catch {
    // The choice can be offered again if device storage is unavailable.
  }
}

export function clearDeliveredVoiceAlerts() {
  if (Capacitor.getPlatform() === "android" && Capacitor.isPluginAvailable("PushNotifications"))
    void PushNotifications.removeAllDeliveredNotifications().catch(() => {});
}

export async function shouldOfferVoiceAlerts(userId: string) {
  if (!Capacitor.isPluginAvailable("PushNotifications") || Capacitor.getPlatform() !== "android")
    return false;
  if (localStorage.getItem(choiceKey(userId))) return false;
  const { available } = await AppChrome.hasFirebaseMessaging();
  if (!available) return false;
  const [{ data }, permission] = await Promise.all([
    supabase.rpc("voice_reply_push_available"),
    PushNotifications.checkPermissions(),
  ]);
  return data === true && permission.receive !== "denied";
}

export async function enableVoiceAlerts(userId: string) {
  const current = await PushNotifications.checkPermissions();
  const permission = current.receive.startsWith("prompt")
    ? await PushNotifications.requestPermissions()
    : current;
  if (permission.receive !== "granted") {
    saveVoiceAlertChoice(userId, "dismissed");
    return;
  }
  await registerVoiceAlerts(userId);
  saveVoiceAlertChoice(userId, "enabled");
}

export function refreshVoiceAlerts(userId: string) {
  if (Capacitor.getPlatform() !== "android" || !Capacitor.isPluginAvailable("PushNotifications"))
    return;
  if (localStorage.getItem(choiceKey(userId)) !== "enabled") return;
  void PushNotifications.checkPermissions()
    .then(({ receive }) => {
      if (receive === "granted") return registerVoiceAlerts(userId);
    })
    .catch(() => {});
}

function registerVoiceAlerts(userId: string) {
  registration ??= register(userId).finally(() => {
    registration = undefined;
  });
  return registration;
}

async function register(userId: string) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.user.id !== userId) throw new Error("Account changed");
  const { available, supportsChannels } = await AppChrome.hasFirebaseMessaging();
  if (!available) throw new Error("Firebase unavailable");
  if (supportsChannels) {
    await PushNotifications.createChannel({
      id: channelId,
      name: "Hlasové odpovede",
      importance: 3,
      visibility: 1,
    });
  }
  let success: PluginListenerHandle | undefined;
  let failure: PluginListenerHandle | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const token = await new Promise<string>((resolve, reject) => {
      timeout = setTimeout(() => reject(new Error("Registration timed out")), 10_000);
      void (async () => {
        success = await PushNotifications.addListener("registration", ({ value }) =>
          resolve(value),
        );
        failure = await PushNotifications.addListener("registrationError", reject);
        await PushNotifications.register();
      })().catch(reject);
    });
    const {
      data: { session: active },
    } = await supabase.auth.getSession();
    if (active?.user.id !== userId || active.access_token !== session.access_token) {
      throw new Error("Account changed");
    }
    const { error } = await supabase.rpc("register_voice_reply_device", { p_token: token });
    if (error) throw error;
  } finally {
    clearTimeout(timeout);
    await success?.remove();
    await failure?.remove();
  }
}
