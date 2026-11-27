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
  const isGrid = slotIndices.length > 1;
  return (
    <ul className={isGrid ? "video-slot-grid" : "mt-3 grid"}>
      {slotIndices.map((idx) => {
        const url = snippets[idx];
        return (
          <li key={idx} className="video-slot-card" data-filled={Boolean(url)}>
            <div className="video-slot-media" aria-hidden="true">
              {url ? (
                <video
                  src={url}
                  autoPlay
                  loop
                  muted
                  playsInline
                  preload="auto"
                  onTimeUpdate={(e) => {
                    const v = e.currentTarget;
                    if (Number.isFinite(v.duration) && v.duration > 3.2 && v.currentTime >= 3) {
                      v.currentTime = 0;
                    }
                  }}
                  className={`size-full bg-black object-cover -scale-x-100 ${blurred ? "blur-[10px]" : ""}`}
                />
              ) : (
                <Film className="size-7 text-muted-foreground/65" />
              )}
              <span className="video-slot-badge" data-filled={Boolean(url)}>
                {url ? `Video ${idx + 1}` : `Moment ${idx + 1}`}
              </span>
            </div>
            <div className="video-slot-actions">
              {url ? (
                <button
                  type="button"
                  onClick={() => onRemove(idx)}
                  aria-label={`Odstrániť video ${idx + 1}`}
                  className="video-slot-btn video-slot-btn-danger"
                >
                  <X className="size-4 shrink-0" aria-hidden="true" />
                  <span>Odstrániť</span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => onRecord(idx)}
                    aria-label={`Nahrať video ${idx + 1} kamerou`}
                    className="video-slot-btn video-slot-btn-primary"
                  >
                    <Camera className="size-4 shrink-0" aria-hidden="true" />
                    <span>Nahrať</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpload(idx)}
                    aria-label={`Nahrať video ${idx + 1} z galérie`}
                    className="video-slot-btn video-slot-btn-icon"
                  >
                    <Upload className="size-4 shrink-0" aria-hidden="true" />
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
