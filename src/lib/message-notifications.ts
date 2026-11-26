export type MessageAlertSettings = { enabled: boolean; quiet: boolean; start: string; end: string };

const defaults: MessageAlertSettings = {
  enabled: false,
  quiet: false,
  start: "22:00",
  end: "08:00",
};
const storageKey = (userId: string) => "reson:message-alerts:" + userId;

function minutes(value: string) {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hours, mins] = value.split(":").map(Number);
  return hours * 60 + mins;
}

export function isQuietTime(settings: MessageAlertSettings, now: Date) {
  if (!settings.quiet) return false;
  const start = minutes(settings.start);
  const end = minutes(settings.end);
  if (start === null || end === null || start === end) return false;
  const current = now.getHours() * 60 + now.getMinutes();
  return start < end ? current >= start && current < end : current >= start || current < end;
}

export function readMessageAlertSettings(userId: string): MessageAlertSettings {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return defaults;
    const { enabled, quiet, start, end } = JSON.parse(raw);
    return {
      enabled: enabled === true,
      quiet: quiet === true,
      start: typeof start === "string" && minutes(start) !== null ? start : defaults.start,
      end: typeof end === "string" && minutes(end) !== null ? end : defaults.end,
    };
  } catch {
    return defaults;
  }
}

export function saveMessageAlertSettings(userId: string, settings: MessageAlertSettings) {
  if (
    settings.quiet &&
    (minutes(settings.start) === null ||
      minutes(settings.end) === null ||
      settings.start === settings.end)
  )
    throw new RangeError("Invalid quiet hours");
  localStorage.setItem(storageKey(userId), JSON.stringify(settings));
}

export function shouldShowMessageAlert(userId: string, now = new Date()) {
  const settings = readMessageAlertSettings(userId);
  return settings.enabled && !isQuietTime(settings, now);
}
