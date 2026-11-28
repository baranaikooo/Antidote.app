import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { refreshVoiceAlerts } from "./android-voice-alerts";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  getSession: vi.fn(),
  readStartupNotificationGrant: vi.fn(),
  consumeStartupNotificationGrant: vi.fn(),
  checkPermissions: vi.fn(),
  register: vi.fn(),
  registrationCallback: undefined as ((token: { value: string }) => void) | undefined,
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { getPlatform: () => "android", isPluginAvailable: () => true },
  registerPlugin: () => ({
    readStartupNotificationGrant: mocks.readStartupNotificationGrant,
    consumeStartupNotificationGrant: mocks.consumeStartupNotificationGrant,
    hasFirebaseMessaging: async () => ({ available: true, supportsPrivatePreview: true }),
    prepareNotificationPreview: async () => ({ audience: "audience" }),
  }),
}));
vi.mock("@capacitor/push-notifications", () => ({
  PushNotifications: {
    checkPermissions: mocks.checkPermissions,
    register: mocks.register,
    addListener: async (event: string, listener: typeof mocks.registrationCallback) => {
      if (event === "registration") mocks.registrationCallback = listener;
      return { remove: async () => {} };
    },
  },
}));
vi.mock("./supabase", () => ({
  supabase: { rpc: mocks.rpc, auth: { getSession: mocks.getSession } },
}));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.registrationCallback = undefined;
  mocks.rpc.mockResolvedValue({ data: null, error: null });
  mocks.getSession.mockResolvedValue({
    data: { session: { user: { id: "me" }, access_token: "access" } },
  });
  mocks.readStartupNotificationGrant.mockResolvedValue({ pending: true });
  mocks.consumeStartupNotificationGrant.mockResolvedValue(undefined);
  mocks.checkPermissions.mockResolvedValue({ receive: "granted" });
  mocks.register.mockImplementation(async () =>
    mocks.registrationCallback?.({ value: "device-token" }),
  );
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
});

afterEach(() => vi.unstubAllGlobals());

it("enables both alert types for a new account after Android grants notifications at startup", async () => {
  await refreshVoiceAlerts("me");
  expect(mocks.rpc).toHaveBeenCalledWith("register_android_preview_device", {
    p_token: "device-token",
    p_voice_replies: true,
    p_chat_messages: true,
    p_preview_audience: "audience",
  });
  expect(mocks.consumeStartupNotificationGrant).toHaveBeenCalledOnce();
});

it("preserves saved alert settings and keeps the grant pending if registration fails", async () => {
  mocks.rpc.mockResolvedValueOnce({
    data: { chat_messages: false, voice_replies: true },
    error: null,
  });
  mocks.rpc.mockResolvedValueOnce({ data: null, error: new Error("offline") });
  await refreshVoiceAlerts("me");
  expect(mocks.rpc).toHaveBeenCalledWith("register_android_preview_device", {
    p_token: "device-token",
    p_voice_replies: null,
    p_chat_messages: null,
    p_preview_audience: "audience",
  });
  expect(mocks.consumeStartupNotificationGrant).not.toHaveBeenCalled();
});

it("does not enroll the device without Android permission", async () => {
  mocks.checkPermissions.mockResolvedValue({ receive: "denied" });
  await refreshVoiceAlerts("me");
  expect(mocks.register).not.toHaveBeenCalled();
  expect(mocks.consumeStartupNotificationGrant).not.toHaveBeenCalled();
});
