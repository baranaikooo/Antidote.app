import { useEffect, useState } from "react";

/** Opens an email draft; the notice is only sent when the user sends that email. */
export function IllegalContentNotice() {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [location, setLocation] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [goodFaith, setGoodFaith] = useState(false);

  useEffect(() => {
    const show = (event: Event) => {
      setReason((event as CustomEvent<string>).detail || "");
      setOpen(true);
    };
    window.addEventListener("antidote:report", show);
    return () => window.removeEventListener("antidote:report", show);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-2 left-2 z-40 bg-background border border-border px-2 py-1 text-xs text-foreground"
      >
        Nahlásiť nezákonný obsah
      </button>
      {open && (
        <div
          className="fixed inset-0 z-[110] overflow-y-auto bg-background/90 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="notice-title"
        >
          <form
            className="mx-auto my-4 max-w-lg space-y-4 border border-border bg-card p-5 text-foreground"
            onSubmit={(event) => {
              event.preventDefault();
              const body = `Dôvod a vysvetlenie: ${reason}\n\nPresné umiestnenie obsahu: ${location}\n\nMeno: ${name}\nE-mail: ${email}\n\nSom v dobrej viere presvedčený/á, že informácie v oznámení sú presné a úplné.`;
              window.location.href = `mailto:hello@antidote.app?subject=${encodeURIComponent("Oznámenie nezákonného obsahu podľa DSA")}&body=${encodeURIComponent(body)}`;
            }}
          >
            <h2 id="notice-title" className="text-lg font-bold">
              Oznámenie nezákonného obsahu
            </h2>
            <p className="text-sm">
              Kontaktné miesto pre používateľov a orgány podľa DSA:{" "}
              <a className="underline" href="mailto:hello@antidote.app">
                hello@antidote.app
              </a>
              . Komunikácia v slovenčine.
            </p>
            <label className="block text-sm">
              Prečo je obsah podľa teba nezákonný?
              <textarea
                required
                maxLength={4000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-1 block w-full border border-border bg-background p-2"
                rows={4}
              />
            </label>
            <label className="block text-sm">
              Presné umiestnenie obsahu (URL alebo údaje potrebné na jeho nájdenie)
              <textarea
                required
                maxLength={2000}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="mt-1 block w-full border border-border bg-background p-2"
                rows={2}
              />
            </label>
            <label className="block text-sm">
              Meno{" "}
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 block w-full border border-border bg-background p-2"
              />
            </label>
            <label className="block text-sm">
              E-mail{" "}
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full border border-border bg-background p-2"
              />
            </label>
            <p className="text-xs">
              Meno a e-mail uveď na potvrdenie prijatia a informovanie o rozhodnutí. Pri oznámení
              určitých trestných činov sexuálneho zneužívania detí ich uvádzať nemusíš.
            </p>
            <label className="flex gap-2 text-sm">
              <input
                type="checkbox"
                required
                checked={goodFaith}
                onChange={(e) => setGoodFaith(e.target.checked)}
              />{" "}
              Som v dobrej viere presvedčený/á, že informácie sú presné a úplné.
            </label>
            <p className="text-xs">
              Tlačidlo otvorí návrh v tvojej e-mailovej aplikácii. Oznámenie musíš následne odoslať.
            </p>
            <div className="flex gap-3">
              <button type="submit" className="bg-foreground px-4 py-2 text-background">
                Otvoriť e-mail
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="border border-border px-4 py-2"
              >
                Zavrieť
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
