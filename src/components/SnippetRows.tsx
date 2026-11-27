import { Camera, Film, Upload, X } from "lucide-react";

export const PROFILE_SLOTS = [0, 1, 2, 3];

export function SnippetRows({
  snippets,
  onRecord,
  onUpload,
  onRemove,
  blurred = false,
  slotIndices = PROFILE_SLOTS,
}: {
  snippets: string[];
  onRecord: (index: number) => void;
  onUpload: (index: number) => void;
  onRemove: (index: number) => void;
  blurred?: boolean;
  slotIndices?: readonly number[];
}) {
  return (
    <ul className={slotIndices.length > 1 ? "grid gap-x-5 sm:grid-cols-2" : undefined}>
      {slotIndices.map((idx) => {
        const url = snippets[idx];
        return (
          <li key={idx} className="personal-row py-2">
            <div className="flex min-w-0 items-center gap-3">
              <div className="personal-thumbnail rounded-lg" aria-hidden="true">
                {url ? (
                  <video
                    src={url}
                    autoPlay
                    loop
                    muted
                    playsInline
                    onTimeUpdate={(e) => {
                      if (e.currentTarget.currentTime >= 3) e.currentTarget.currentTime = 0;
                    }}
                    className={`size-full bg-black object-cover -scale-x-100 ${blurred ? "blur-[10px]" : ""}`}
                  />
                ) : <Film className="size-5" />}
              </div>
              <div className="min-w-0">
                <p className="font-semibold">Video {idx + 1}</p>
                <p className="personal-status">{url ? "Pridané" : "Prázdne"}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {url ? (
                <button type="button" onClick={() => onRemove(idx)} aria-label={`Odstrániť video ${idx + 1}`} className="personal-icon-button rounded-lg">
                  <X className="size-5" />
                </button>
              ) : (
                <>
                  <button type="button" onClick={() => onRecord(idx)} aria-label={`Nahrať video ${idx + 1} kamerou`} className="personal-icon-button rounded-lg">
                    <Camera className="size-5" />
                  </button>
                  <button type="button" onClick={() => onUpload(idx)} aria-label={`Nahrať video ${idx + 1} z galérie`} className="personal-icon-button rounded-lg">
                    <Upload className="size-5" />
                  </button>
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
