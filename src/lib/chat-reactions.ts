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

export type ChatGifId = (typeof CHAT_GIFS)[number]["id"];

const GIPHY_MEDIA_ROOT = "https://media.giphy.com/media/";
const GIPHY_GIF_FILE = "/200w.gif";

export function chatGifUrl(id: ChatGifId, preview = false) {
  return GIPHY_MEDIA_ROOT + id + (preview ? "/200w_s.gif" : GIPHY_GIF_FILE);
}

const approvedGifs = new Map<string, (typeof CHAT_GIFS)[number]>(
  CHAT_GIFS.map((gif) => [chatGifUrl(gif.id), gif]),
);

export function readChatGif(url?: string | null) {
  const gif = url ? approvedGifs.get(url) : undefined;
  return gif ? { kind: "gif" as const, url: chatGifUrl(gif.id), label: gif.label } : undefined;
}
