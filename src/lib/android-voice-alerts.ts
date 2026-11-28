import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { supabase } from "./supabase";

const AppChrome = registerPlugin<{
  hasFirebaseMessaging(): Promise<{
    available: boolean;
    supportsChannels: boolean;
    supportsPrivatePreview?: boolean;
  }>;
  addListener(
    event: "startupNotificationGrant",
    listener: () => void,
  ): Promise<PluginListenerHandle>;
  readStartupNotificationGrant(): Promise<{ pending: boolean }>;
  consumeStartupNotificationGrant(): Promise<void>;
  prepareNotificationPreview(options: { userId: string }): Promise<{ audience: string }>;
  clearNotificationPreview(): Promise<void>;
}>("AppChrome");
const choiceKey = (userId: string) => `antidote:voice-alerts:${userId}`;
const channelId = "voice-replies";
let registration: Promise<void> | undefined;
let refreshing: { userId: string; promise: Promise<void> } | undefined;

export type AndroidAlertOptions = {
  voice_replies: boolean;
  chat_messages: boolean;
};

export const defaultAndroidAlertOptions: AndroidAlertOptions = {
  voice_replies: false,
  chat_messages: false,
};

export function hasAndroidPush() {
  return Capacitor.getPlatform() === "android" && Capacitor.isPluginAvailable("PushNotifications");
}

export async function readAndroidAlertOptions(): Promise<AndroidAlertOptions | null> {
  const { available } = await AppChrome.hasFirebaseMessaging();
  if (!available) return null;
  const { data, error } = await supabase.rpc("android_notification_options");
  if (error) throw error;
  return data ?? defaultAndroidAlertOptions;
}

export async function saveAndroidAlertOptions(
  userId: string,
  options: AndroidAlertOptions,
  previous: AndroidAlertOptions,
) {
  const enabled = options.voice_replies || options.chat_messages;
  const enabling =
    (options.voice_replies && !previous.voice_replies) ||
    (options.chat_messages && !previous.chat_messages);
  if (enabling) {
    if (!(await requestAndroidAlertPermission())) return false;
    await registration?.catch(() => {});
    await registerVoiceAlerts(userId, options);
  } else {
    const { error } = await supabase.rpc("set_android_notification_options", {
      p_voice_replies: options.voice_replies,
      p_chat_messages: options.chat_messages,
      p_show_sender: false,
    });
    if (error) throw error;
  }
  if (!enabled) clearDeliveredVoiceAlerts();
  saveVoiceAlertChoice(userId, enabled ? "enabled" : "dismissed");
  return true;
}

function saveVoiceAlertChoice(userId: string, choice: "enabled" | "dismissed") {
  try {
    localStorage.setItem(choiceKey(userId), choice);
  } catch {
    // The choice can be offered again if device storage is unavailable.
  }
}

export function clearDeliveredVoiceAlerts() {
  if (!hasAndroidPush()) return;
  void AppChrome.clearNotificationPreview().catch(() => {});
  void PushNotifications.removeAllDeliveredNotifications().catch(() => {});
}

async function requestAndroidAlertPermission() {
  const current = await PushNotifications.checkPermissions();
  const permission = current.receive.startsWith("prompt")
    ? await PushNotifications.requestPermissions()
    : current;
  return permission.receive === "granted";
}

export function onStartupNotificationGrant(listener: () => void) {
  return hasAndroidPush() ? AppChrome.addListener("startupNotificationGrant", listener) : undefined;
}

export function refreshVoiceAlerts(userId: string) {
  if (!hasAndroidPush()) return;
  if (refreshing?.userId === userId) return refreshing.promise;
  const promise = refreshRegistration(userId)
    .catch(() => {})
    .finally(() => {
      if (refreshing?.promise === promise) refreshing = undefined;
    });
  refreshing = { userId, promise };
  return promise;
}

async function refreshRegistration(userId: string) {
  const { pending } = await AppChrome.readStartupNotificationGrant().catch(() => ({
    pending: false,
  }));
  const choice = localStorage.getItem(choiceKey(userId));
  if (!pending && choice !== "enabled") return;
  if ((await PushNotifications.checkPermissions()).receive !== "granted") return;

  if (pending && !choice) {
    const { data, error } = await supabase.rpc("android_notification_options");
    if (error) throw error;
    await registerVoiceAlerts(
      userId,
      data ? undefined : { voice_replies: true, chat_messages: true },
    );
    const enabled = !data || data.voice_replies || data.chat_messages;
    saveVoiceAlertChoice(userId, enabled ? "enabled" : "dismissed");
  } else if (choice === "enabled") {
    await registerVoiceAlerts(userId);
  }

  if (pending) await AppChrome.consumeStartupNotificationGrant();
}

function registerVoiceAlerts(userId: string, options?: AndroidAlertOptions) {
  registration ??= register(userId, options).finally(() => {
    registration = undefined;
  });
  return registration;
}

async function register(userId: string, options?: AndroidAlertOptions) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.user.id !== userId) throw new Error("Account changed");
  const { available, supportsChannels, supportsPrivatePreview } =
    await AppChrome.hasFirebaseMessaging();
  if (!available) throw new Error("Firebase unavailable");
  if (supportsChannels && !supportsPrivatePreview) {
    await Promise.all([
      PushNotifications.createChannel({
        id: channelId,
        name: "Hlasové odpovede",
        importance: 3,
        visibility: 1,
      }),
      PushNotifications.createChannel({
        id: "chat-messages",
        name: "Správy",
        importance: 3,
        visibility: 1,
      }),
    ]);
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
    const preview = supportsPrivatePreview
      ? await AppChrome.prepareNotificationPreview({ userId })
      : null;
    const { error } = await supabase.rpc("register_android_preview_device", {
      p_token: token,
      p_voice_replies: options?.voice_replies ?? null,
      p_chat_messages: options?.chat_messages ?? null,
      p_preview_audience: preview?.audience ?? null,
    });
    if (error) throw error;
  } finally {
    clearTimeout(timeout);
    await success?.remove();
    await failure?.remove();
  }
}
