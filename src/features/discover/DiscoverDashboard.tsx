import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Compass,
  MapPin,
  MessageCircle,
  Radar,
  RefreshCw,
  User,
} from "lucide-react";

import { AntidoteLogo } from "@/components/AntidoteLogo";
import { MatchCardIdentity } from "@/components/MatchCardIdentity";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useHaptic } from "@/hooks/use-haptics";
import { PRIORITY_CATEGORIES } from "@/lib/priority-categories";
import { recommendationReason } from "@/lib/recommendation-reason";
import type { RankedMatch, UserProfile } from "@/lib/resonance";
import { supabase } from "@/lib/supabase";

export function MatchCard({
  match,
  myPriority,
  radiusKm,
  position,
  busy,
  onSelect,
}: {
  match: RankedMatch;
  myPriority?: string;
  radiusKm?: number;
  position?: number;
  busy: boolean;
  onSelect: () => void;
}) {
  const reason = recommendationReason(myPriority, match.top_priority, radiusKm, match.distanceKm);
  const priorityLabel = match.top_priority
    ? PRIORITY_CATEGORIES.find((category) => category.id === match.top_priority)?.label
    : undefined;
  const reflection = match.shared_reflection?.trim();
  const card = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!position || !card.current || !("IntersectionObserver" in window)) return;
    let visible = false;
    let sent = false;
    function recordView() {
      if (!visible || sent || document.visibilityState !== "visible") return;
      sent = true;
      void supabase
        .rpc("record_matching_pilot_exposure", {
          p_candidate_id: match.id,
          p_position: position,
        })
        .then(({ error }) => {
          if (error) sent = false;
        });
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting && entry.intersectionRatio >= 0.25;
        recordView();
      },
      { threshold: 0.25 },
    );
    observer.observe(card.current);
    document.addEventListener("visibilitychange", recordView);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", recordView);
    };
  }, [match.id, position]);

  return (
    <article ref={card} className="match-card" data-tone={match.top_priority ?? "default"}>
      <MatchCardIdentity
        name={match.name}
        age={match.age}
        city={match.city}
        distanceKm={match.distanceKm}
        orbSeed={match.id}
      />
      {priorityLabel && (
        <div className="match-card-meta">
          <span className="match-card-pill">Priorita: {priorityLabel}</span>
        </div>
      )}
      {reason && (
        <p className="match-card-reason">
          <Compass className="size-4" aria-hidden="true" />
          <span>{reason}</span>
        </p>
      )}
      {reflection && (
        <div className="match-card-reflection">
          <p className="match-card-reflection-label">Myšlienka z profilu</p>
          <blockquote>„{reflection}“</blockquote>
        </div>
      )}
      <button type="button" onClick={onSelect} disabled={busy} className="match-card-action">
        {busy ? "Otváram rozhovor…" : "Osloviť"}
        <MessageCircle className="size-5 shrink-0" aria-hidden="true" />
      </button>
    </article>
  );
}

export function Dashboard({
  profile,
  matches,
  pendingRadius,
  loading,
  failed,
  onRefresh,
  onChangeRadius,
  onProfile,
  onSelectMatch,
  openingMatch,
  openError,
  onMessages,
  hasMessages,
  recentReply,
}: {
  profile: UserProfile;
  matches: RankedMatch[];
  pendingRadius: number | null;
  loading: boolean;
  failed: boolean;
  onRefresh: () => void;
  onChangeRadius: (radius: number) => Promise<void>;
  onProfile: () => void;
  onSelectMatch: (match: RankedMatch) => void;
  openingMatch: boolean;
  openError: boolean;
  onMessages: () => void;
  hasMessages: boolean;
  recentReply?: { name: string; preview?: string; onOpen: () => void };
}) {
  const haptic = useHaptic();

  const [matchIndex, setMatchIndex] = useState(0);
  const [editingRadius, setEditingRadius] = useState(false);
  const savedRadius = Math.min(profile.radiusKm ?? 500, 500);
  const [radiusChoice, setRadiusChoice] = useState(savedRadius);
  const savingRadius = pendingRadius !== null;
  const [radiusFailed, setRadiusFailed] = useState(false);
  const displayedRadius = pendingRadius ?? savedRadius;
  const nearby = displayedRadius < 500;
  const searchRange = nearby ? `Do ${displayedRadius} km` : "Celý svet";
  const radiusButton = useRef<HTMLButtonElement>(null);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  function closeRadiusEditor() {
    setEditingRadius(false);
    requestAnimationFrame(() => radiusButton.current?.focus({ preventScroll: true }));
  }
  const initial = Array.from(profile.name.trim())[0]?.toLocaleUpperCase("sk");

  async function saveSearchRadius() {
    if (savingRadius || radiusChoice === savedRadius) return;
    haptic("tap");
    setRadiusFailed(false);
    closeRadiusEditor();
    try {
      await onChangeRadius(radiusChoice);
      setMatchIndex(0);
    } catch {
      setRadiusFailed(true);
      setEditingRadius(true);
    }
  }
  const availableMatches = matches;
  const activeIndex = Math.max(0, Math.min(matchIndex, availableMatches.length - 1));
  const activeMatch = availableMatches[activeIndex];
  const radiusOptions = [...new Set([25, 50, 100, 200, savedRadius])]
    .filter((radius) => radius < 500)
    .sort((a, b) => a - b)
    .map((radius) => ({ value: radius, label: `Do ${radius} km` }))
    .concat({ value: 500, label: "Celý svet" });

  function selectProfile(index: number) {
    if (index === activeIndex || index < 0 || index >= availableMatches.length) return;
    haptic("tap");
    setMatchIndex(index);
  }

  return (
    <div className="personal-screen discover-screen">
      <header className="discover-header">
        <div className="discover-topline">
          <AntidoteLogo markClassName="h-6" />
          <button
            type="button"
            className="discover-profile"
            aria-label={`Otvoriť môj profil, ${profile.name}`}
            onClick={onProfile}
          >
            <span className="discover-avatar" aria-hidden="true">
              {initial || <User className="size-4" />}
            </span>
            <span>{profile.name}</span>
            <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
          </button>
        </div>
        <div className="discover-title-row">
          <h1 className="personal-title">Spojenia</h1>
          <button
            ref={radiusButton}
            type="button"
            className="discover-radius-chip"
            aria-expanded={editingRadius}
            aria-controls="discover-radius-editor"
            aria-disabled={savingRadius}
            aria-label={`Upraviť dosah odporúčaní, aktuálne ${searchRange}`}
            onClick={() => {
              if (savingRadius) return;
              if (editingRadius) {
                closeRadiusEditor();
              } else {
                setRadiusChoice(savedRadius);
                setRadiusFailed(false);
                setEditingRadius(true);
              }
            }}
          >
            <MapPin className="size-4 shrink-0" aria-hidden="true" />
            <span>{savingRadius ? "Ukladám…" : searchRange}</span>
          </button>
        </div>
        <Drawer
          open={editingRadius}
          onOpenChange={(open) => {
            if (!open && !savingRadius) closeRadiusEditor();
          }}
        >
          <DrawerContent className="mx-auto max-w-md border-border bg-card text-foreground">
            <DrawerHeader>
              <DrawerTitle className="font-display text-xl">Nový dosah odporúčaní</DrawerTitle>
            </DrawerHeader>
            <form
              className="grid gap-2 px-4 pb-2"
              onSubmit={(event) => {
                event.preventDefault();
                void saveSearchRadius();
              }}
            >
              <div className="grid gap-1.5" role="radiogroup" aria-label="Nový dosah odporúčaní">
                {radiusOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={radiusChoice === opt.value}
                    disabled={savingRadius}
                    onClick={() => {
                      haptic("tap");
                      setRadiusChoice(opt.value);
                    }}
                    className="drawer-option"
                  >
                    <span>{opt.label}</span>
                    {radiusChoice === opt.value && <Check className="size-4 shrink-0" aria-hidden="true" />}
                  </button>
                ))}
              </div>
              {radiusFailed && (
                <p role="alert" className="text-sm text-destructive">
                  Dosah sa nepodarilo uložiť. Skús to znova.
                </p>
              )}
              <DrawerFooter className="px-0 pt-3">
                <button
                  type="submit"
                  className="match-card-action"
                  disabled={savingRadius || radiusChoice === savedRadius}
                >
                  {savingRadius ? "Ukladám…" : "Uložiť dosah"}
                </button>
                <DrawerClose asChild>
                  <button
                    type="button"
                    className="personal-action w-full justify-center"
                    disabled={savingRadius}
                    onClick={closeRadiusEditor}
                  >
                    Zrušiť
                  </button>
                </DrawerClose>
              </DrawerFooter>
            </form>
          </DrawerContent>
        </Drawer>
      </header>

      {recentReply && (
        <section className="discover-reply editorial-panel" aria-labelledby="discover-reply-title">
          <MessageCircle className="size-5 text-accent" aria-hidden="true" />
          <div className="min-w-0">
            <h2 id="discover-reply-title" className="font-bold text-foreground">
              Nová správa od {recentReply.name}
            </h2>
            {recentReply.preview && (
              <p className="mt-1 truncate text-sm text-muted-foreground">{recentReply.preview}</p>
            )}
            <button type="button" className="personal-action mt-3" onClick={recentReply.onOpen}>
              Pokračovať v rozhovore
            </button>
          </div>
        </section>
      )}

      {activeMatch ? (
        <section
          className="match-deck match-swipe-area"
          aria-label="Dnešné odporúčania"
          onPointerDown={(e) => {
            if (availableMatches.length < 2) return;
            swipeStart.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerUp={(e) => {
            const start = swipeStart.current;
            swipeStart.current = null;
            if (!start || availableMatches.length < 2) return;
            const dx = e.clientX - start.x;
            const dy = e.clientY - start.y;
            if (Math.abs(dx) < 56 || Math.abs(dx) <= Math.abs(dy) * 1.4) return;
            if (dx < 0 && activeIndex < availableMatches.length - 1) selectProfile(activeIndex + 1);
            if (dx > 0 && activeIndex > 0) selectProfile(activeIndex - 1);
          }}
        >
          <MatchCard
            key={activeMatch.id}
            match={activeMatch}
            myPriority={profile.topPriority}
            radiusKm={profile.radiusKm}
            position={loading || failed ? undefined : activeIndex + 1}
            busy={openingMatch}
            onSelect={() => onSelectMatch(activeMatch)}
          />
          {openError && (
            <p role="alert" className="mt-2 text-destructive">
              Rozhovor sa nepodarilo otvoriť. Skús to znova.
            </p>
          )}
          {availableMatches.length > 1 && (
            <div className="match-deck-nav" role="group" aria-label="Výber profilu">
              <button
                type="button"
                aria-label="Predchádzajúci profil"
                disabled={activeIndex === 0}
                onClick={() => selectProfile(activeIndex - 1)}
              >
                <ChevronLeft aria-hidden="true" className="size-5" />
                <span>Predošlý</span>
              </button>
              <span className="match-deck-counter">
                {activeIndex + 1} / {availableMatches.length}
              </span>
              <button
                type="button"
                aria-label="Ďalší profil"
                disabled={activeIndex === availableMatches.length - 1}
                onClick={() => selectProfile(activeIndex + 1)}
              >
                <span>Ďalší</span>
                <ChevronRight aria-hidden="true" className="size-5" />
              </button>
            </div>
          )}
          <p className="sr-only" role="status">
            Profil {activeIndex + 1} z {availableMatches.length}, {activeMatch.name}
          </p>
          {activeIndex === availableMatches.length - 1 && (
            <p className="mt-3 text-sm text-muted-foreground">Tu sa táto sada odporúčaní končí.</p>
          )}
        </section>
      ) : (
        <section className="discover-search" aria-busy={loading || savingRadius}>
          <div className="discover-search-icon" data-busy={loading || savingRadius}>
            <Radar className="size-6" aria-hidden="true" />
          </div>
          <div>
            <h2 className="personal-heading">
              {savingRadius
                ? "Ukladám nový dosah…"
                : loading
                  ? "Hľadám nové spojenia…"
                  : failed
                    ? "Spojenia sa nepodarilo načítať"
                    : "Zatiaľ žiadne nové spojenia"}
            </h2>
            <p className="discover-search-copy">
              {failed
                ? "Skontroluj pripojenie a skús hľadať znova."
                : nearby
                  ? "V tomto okruhu momentálne nemáš žiadne odporúčania."
                  : "Odporúčania sa tu objavia, keď budú dostupné."}
            </p>
          </div>

          <button
            type="button"
            className="discover-refresh"
            disabled={loading || savingRadius}
            onClick={() => {
              haptic("tap");
              onRefresh();
            }}
          >
            <RefreshCw className="size-4 shrink-0" aria-hidden="true" />
            Hľadať znova
          </button>
        </section>
      )}

      {hasMessages && (
        <button type="button" onClick={onMessages} className="discover-messages">
          <MessageCircle className="size-5 shrink-0" aria-hidden="true" />
          Otvoriť rozhovory
          <ChevronRight className="ml-auto size-5 shrink-0" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
