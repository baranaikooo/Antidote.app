export const CHAT_GIFS = [
  { id: "EKrFksrzxQxlb5ahiq", label: "Ahoj" },
  { id: "MPxg9U887PS0B8XT4J", label: "Pozdrav" },
  { id: "Wj116ZszUZEwRIoz0j", label: "Mávanie" },
  { id: "9Ekme9q1d8rEImpvFu", label: "Prekvapená mačka" },
  { id: "VHtuGwzaT0p9uc1Fyi", label: "Kuk" },
  { id: "SLhS4qdH5XsissZ7cV", label: "Šokovaná mačka" },
  { id: "TlK63ETpu0aX6eJBRu0", label: "Potlesk a konfety" },
  { id: "l0K4m0mzkJDAIdhHW", label: "Potlesk" },
  { id: "3o6Zt0KNPZgqZlCu6k", label: "Gratulujem" },
  { id: "IdmZ0ECRI5OzJZwEpT", label: "Káva a žmurknutie" },
  { id: "S01epno8jedbadR94l", label: "Čas na kávu" },
  { id: "l0K45fwBufXrJM2jK", label: "Rozmýšľam" },
  { id: "Y2VBz2SExrnyxRqGO1", label: "Wow" },
  { id: "G4A47qhLk2r3jC7eSu", label: "Popcorn" },
  { id: "G5MDBwmdTrVMpuRJix", label: "Ďakujem" },
  { id: "l0MYy2GInHvLon2jS", label: "Milé poďakovanie" },
  { id: "l0HlU58VINoTOW6Fa", label: "Tanec od radosti" },
  { id: "l2QDYGQQKKNGq6mhq", label: "Srdiečko" },
  { id: "XwEDiXDF4R6LLtyTFR", label: "Vďaka" },
  { id: "3ohs7Qa1M9DxGaI94A", label: "Tancujúca mačka" },
  { id: "QVvJOcVF7vxhOcL2N9", label: "Tancujúca kačka" },
  { id: "Yle9Yz9izeVRyiwavn", label: "Objatie na diaľku" },
  { id: "bnOIY81AEMa4llyfFI", label: "Tancujúca lienka" },
  { id: "JRQeedL8rzLlSvimz9", label: "Mačacie trio" },
] as const;

export type ChatGif = { url: string; previewUrl: string; label: string };
const KLIPY_GIF = /^https:\/\/static[.]klipy[.]com\/ii\/[A-Za-z0-9/_-]+[.]gif$/;

export const FEATURED_GIFS: ChatGif[] = CHAT_GIFS.map(({ id, label }) => ({
  url: `https://media.giphy.com/media/${id}/200w.gif`,
  previewUrl: `https://media.giphy.com/media/${id}/200w_s.gif`,
  label,
}));

const approvedGifs = new Map(FEATURED_GIFS.map((gif) => [gif.url, gif]));

export function isKlipyGif(url: unknown): url is string {
  return typeof url === "string" && url.length <= 512 && KLIPY_GIF.test(url);
}

export function readChatGif(url?: string | null) {
  if (!url) return undefined;
  const gif = approvedGifs.get(url);
  return gif || isKlipyGif(url)
    ? { kind: "gif" as const, url, label: gif?.label ?? "GIF" }
    : undefined;
}

export function matchFeaturedGifs(query: string) {
  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase();
  const words = normalize(query).split(/\s+/).filter(Boolean);
  return FEATURED_GIFS.filter(({ label }) =>
    words.every((word) => normalize(label).includes(word)),
  );
}
