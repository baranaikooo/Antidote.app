export function notificationPreviewTitle(
  isMessage: boolean,
  senderName: string | null,
  senderGender: string | null,
) {
  const name = senderName?.replace(/\s+/g, " ").trim();
  if (!name) return "";
  if (isMessage) {
    if (senderGender === "female") return `${name} vám napísala`;
    if (senderGender === "male") return `${name} vám napísal`;
    return `${name} vám píše`;
  }
  if (senderGender === "female") return `${name} vám poslala hlasovú odpoveď`;
  if (senderGender === "male") return `${name} vám poslal hlasovú odpoveď`;
  return `${name} vám posiela hlasovú odpoveď`;
}
