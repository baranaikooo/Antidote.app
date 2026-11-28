import { DisclosureSummary } from "@/components/ui/disclosure-summary";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Eye, Mic, MoreVertical, Reply, Send, Sparkles, X } from "lucide-react";
import type { ChatMessage, Conversation } from "@/lib/resonance";
import {
  fetchSharedProfileVideos,
  readConversationStatus,
  REPORT_REASONS,
  setConversationChoice,
  type ConversationChoice,
  type ConversationPartner,
  type ConversationStatus,
} from "@/lib/conversations";
import { fetchChatMessages, saveChatMessage, supabase } from "@/lib/supabase";
import { FEATURED_GIFS, isKlipyGif, matchFeaturedGifs, type ChatGif } from "@/lib/chat-reactions";
import { useHaptic } from "@/hooks/use-haptics";
import { VoiceBubble } from "./VoiceBubble";
import { markConversationRead } from "@/lib/conversation-inbox";
import { ConversationFeedback } from "./ConversationFeedback";
import { SharedConversationQuestion, SharedVoiceQuestion } from "./SharedConversationQuestion";
import { Chamber } from "./VoiceChamber";
import { deleteVoiceDraft, readVoiceDraft, type VoiceDraftKind } from "@/lib/voice-drafts";
import { enableVoiceAlerts, saveVoiceAlertChoice, shouldOfferVoiceAlerts } from "@/lib/android-voice-alerts";
import {
  QUESTION_VOICE_MAX_SECONDS,
  readSharedQuestion,
  submitQuestionVoice,
  type SharedQuestion,
} from "@/lib/shared-question";

export function MessageThread({
  conversation,
  match,
  userId,
  prompt,
  onUpdate,
  onClose,
  onBack,
}: {
  conversation: Conversation;
  match: ConversationPartner;
  userId: string;
  prompt: string;
  onUpdate: (patch: (previous: Conversation) => Conversation) => void;
  onClose: () => void;
  onBack: () => void;
}) {
  const haptic = useHaptic();
  const [status, setStatus] = useState<ConversationStatus | null>(null);
  const [input, setInput] = useState("");
  const [selectedReply, setSelectedReply] = useState<string | null>(null);
  const [sharedQuestion, setSharedQuestion] = useState<SharedQuestion | null>();
  const [recorder, setRecorder] = useState<VoiceDraftKind | false | null>(null);
  const [voiceAlertOffer, setVoiceAlertOffer] = useState<"offered" | "enabling" | "failed" | null>(null);
  const [questionLoadFailed, setQuestionLoadFailed] = useState(false);
  const [sending, setSending] = useState(false);
  const [savingChoice, setSavingChoice] = useState(false);
  const [error, setError] = useState("");
  const [failedSend, setFailedSend] = useState<{ text: string; reaction?: ChatGif } | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const [showGifs, setShowGifs] = useState(false);
  const [gifQuery, setGifQuery] = useState("");
  const [gifResults, setGifResults] = useState<{
    query: string;
    gifs: ChatGif[];
    live: boolean;
  } | null>(null);
  const [showVideos, setShowVideos] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [videos, setVideos] = useState<string[] | null>(null);
  const [videosFailed, setVideosFailed] = useState(false);
  const listEnd = useRef<HTMLDivElement>(null);
  const composerInput = useRef<HTMLTextAreaElement>(null);
  const reactionTrigger = useRef<HTMLButtonElement>(null);
  const gifSearchInput = useRef<HTMLInputElement>(null);
  const draft = useRef<{ key: string; id: string } | null>(null);
  const sendLock = useRef(false);
  const choiceLock = useRef(false);
  const request = useRef(0);
  const lastReadId = useRef<string | null>(null);
  const latestIncoming = conversation.messages.reduce<ChatMessage | null>(
    (previous, message) => (message.from === "them" ? message : previous),
    null,
  );
  const seenMessageId = latestIncoming?.id;

  useEffect(() => {
    if (showGifs && window.matchMedia?.("(pointer: fine)").matches)
      gifSearchInput.current?.focus({ preventScroll: true });
  }, [showGifs]);

  const query = gifQuery.trim();
  const search = query.length >= 2 && gifResults?.query === query ? gifResults : null;
  const displayedGifs = query.length < 2 ? FEATURED_GIFS : (search?.gifs ?? []);

  useEffect(() => {
    if (!showGifs || query.length < 2) return;
    let current = true;
    const timer = window.setTimeout(async () => {
      try {
        const { data, error } = await supabase.functions.invoke("search-chat-gifs", {
          body: { query },
        });
        if (!current) return;
        if (error || data?.source !== "klipy" || !Array.isArray(data.gifs)) {
          setGifResults({ query, gifs: matchFeaturedGifs(query), live: false });
          return;
        }
        const gifs = (data.gifs as ChatGif[]).filter(
          (gif) =>
            isKlipyGif(gif?.url) && isKlipyGif(gif.previewUrl) && typeof gif.label === "string",
        );
        setGifResults({ query, gifs, live: true });
      } catch {
        if (current) setGifResults({ query, gifs: matchFeaturedGifs(query), live: false });
      }
    }, 450);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [query, showGifs]);

  // The lock only serializes saves. The server decides whether a conversation is open.
  const refresh = useCallback(async () => {
    const current = ++request.current;
    void readSharedQuestion(conversation.id)
      .then((question) => {
        if (current !== request.current) return;
        setSharedQuestion(question);
        setQuestionLoadFailed(false);
      })
      .catch(() => {
        if (current === request.current) setQuestionLoadFailed(true);
      });
    try {
      const [next, messages] = await Promise.all([
        readConversationStatus(conversation.id, userId),
        fetchChatMessages(conversation.id, userId),
      ]);
      if (current !== request.current) return;
      setStatus(next);
      setLoadFailed(false);
      onUpdate((previous) => ({
        ...previous,
        status: next.status === "active" ? "active" : "closed",
        messages: mergeMessages(previous.messages, messages),
      }));
    } catch {
      if (current === request.current) setLoadFailed(true);
    }
  }, [conversation.id, userId, onUpdate]);

  useEffect(() => {
    const filter = "match_id=eq." + conversation.id;
    const channel = supabase
      .channel("chat:" + conversation.id)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter },
        () => void refresh(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "matches", filter: "id=eq." + conversation.id },
        () => void refresh(),
      )
      .subscribe((state) => {
        if (state === "SUBSCRIBED") void refresh();
      });
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    void refresh();
    return () => {
      request.current += 1;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [conversation.id, refresh]);

  useEffect(() => {
    if (conversation.messages.length) listEnd.current?.scrollIntoView?.({ block: "end" });
  }, [conversation.messages.length]);

  useEffect(() => {
    if (!seenMessageId) return;
    const messageId = seenMessageId;
    let listening = true;
    let marking = false;
    async function markAsSeen() {
      if (document.visibilityState !== "visible" || marking || lastReadId.current === messageId)
        return;
      marking = true;
      try {
        await markConversationRead(conversation.id, messageId);
        if (listening) {
          lastReadId.current = messageId;
          onUpdate((previous) => (previous.unread ? { ...previous, unread: false } : previous));
        }
      } catch {
        // Leave it unread until a visible or online retry succeeds.
      } finally {
        marking = false;
      }
    }
    const mark = () => void markAsSeen();
    document.addEventListener("visibilitychange", mark);
    window.addEventListener("online", mark);
    mark();
    return () => {
      listening = false;
      document.removeEventListener("visibilitychange", mark);
      window.removeEventListener("online", mark);
    };
  }, [conversation.id, seenMessageId, onUpdate]);

  useEffect(() => {
    if (!showVideos || !status?.is_unlocked) return;
    let active = true;
    setVideos(null);
    setVideosFailed(false);
    void fetchSharedProfileVideos(match.id)
      .then((result) => {
        if (active) setVideos(result);
      })
      .catch(() => {
        if (active) setVideosFailed(true);
      });
    return () => {
      active = false;
    };
  }, [showVideos, status?.is_unlocked, match.id]);

  async function changeChoice(choice: ConversationChoice) {
    if (choiceLock.current) return;
    choiceLock.current = true;
    setSavingChoice(true);
    setError("");
    try {
      const next = await setConversationChoice(conversation.id, choice);
      request.current += 1;
      setStatus(next);
      if (next.status === "deleted") {
        onClose();
      } else {
        void refresh();
      }
    } catch {
      setError("Voľbu sa nepodarilo uložiť. Skús to znova.");
    } finally {
      choiceLock.current = false;
      setSavingChoice(false);
    }
  }

  const hasMessages = conversation.messages.length > 0;
  const reflection = match.shared_reflection?.trim() ? match.shared_reflection : null;
  const hasReplyContext =
    selectedReply === sharedQuestion?.partner_answer ||
    (!hasMessages && selectedReply === reflection);
  const replyContext = hasReplyContext ? selectedReply : null;

  function selectReply(value: string | null) {
    if (sendLock.current) return;
    if (selectedReply !== value) {
      setSelectedReply(value);
      setFailedSend(null);
      setError("");
    }
    composerInput.current?.focus();
  }

  async function send(reaction?: ChatGif) {
    const text = reaction ? "" : input.trim();
    if ((!text && !reaction) || sendLock.current || !canSend) return;
    sendLock.current = true;
    setFailedSend(null);
    setSending(true);
    setError("");
    const key = reaction ? "reaction:" + reaction.url : "text:" + text;
    if (draft.current?.key !== key) draft.current = { key, id: crypto.randomUUID() };

    try {
      const message = await saveChatMessage(
        conversation.id,
        userId,
        text,
        reaction?.url,
        draft.current.id,
        reaction ? undefined : (replyContext ?? undefined),
      );
      onUpdate((previous) => ({
        ...previous,
        messages: mergeMessages(previous.messages, [
          {
            id: message.id,
            from: "me",
            text,
            replyContext: message.reply_context ?? undefined,
            ts: new Date(message.created_at).getTime(),
            media: reaction ? { kind: "gif", url: reaction.url, label: reaction.label } : undefined,
          },
        ]),
      }));
      if (reaction) {
        setShowGifs(false);
        reactionTrigger.current?.focus({ preventScroll: true });
      } else {
        setInput((current) => (current.trim() !== text ? current : ""));
        setSelectedReply(null);
        setShowGifs(false);
      }
      draft.current = null;
      haptic("send");
    } catch {
      setFailedSend({ text, reaction });
      setError("Správu sa nepodarilo odoslať.");
      void refresh();
    } finally {
      sendLock.current = false;
      setSending(false);
    }
  }

  const isOpen = status?.status === "active";
  const canSend =
    isOpen &&
    (hasMessages ||
      (sharedQuestion !== undefined &&
        (!sharedQuestion?.required ||
          Boolean(
            sharedQuestion.voice_required
              ? sharedQuestion.own_voice_path && sharedQuestion.partner_voice_path
              : sharedQuestion.own_answer && sharedQuestion.partner_answer,
          ))));
  const needsVoiceAnswer =
    isOpen && !canSend && sharedQuestion?.voice_required && !sharedQuestion.own_voice_path;
  const canRecord = needsVoiceAnswer ? "answer" : canSend ? "message" : null;

  useEffect(() => {
    if (!canRecord || recorder !== null) return;
    let active = true;
    void readVoiceDraft([userId, conversation.id, canRecord])
      .then((saved) => {
        if (active && saved) setRecorder((current) => current ?? canRecord);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [canRecord, conversation.id, recorder, userId]);

  const savedVoicePath = sharedQuestion?.own_voice_path;
  useEffect(() => {
    // Reconcile a save that completed just before the app was closed.
    if (savedVoicePath && recorder !== "answer") {
      void deleteVoiceDraft([userId, conversation.id, "answer"]).catch(() => {});
    }
  }, [conversation.id, recorder, savedVoicePath, userId]);

  const showPilotQuestion =
    isOpen && latestIncoming && conversation.messages.some((message) => message.from === "me");
  const canRetrySend = failedSend && (failedSend.reaction || failedSend.text === input.trim());
  function updateSharedQuestion(next: SharedQuestion) {
    setSharedQuestion(next);
    void refresh();
  }

  if (isOpen && recorder === "answer" && sharedQuestion?.voice_required) {
    return (
      <Chamber
        key="answer"
        userId={userId}
        matchId={conversation.id}
        name={match.name}
        prompt={sharedQuestion.question}
        onBack={() => setRecorder(false)}
        onAnswer={async (blob, id) => {
          const answer = await submitQuestionVoice(conversation.id, userId, id, blob);
          updateSharedQuestion(answer);
          if (answer.own_voice_path) {
            void shouldOfferVoiceAlerts(userId)
              .then((offer) => {
                if (offer) setVoiceAlertOffer("offered");
              })
              .catch(() => {});
          }
        }}
      />
    );
  }

  if (recorder === "message" && canSend) {
    return (
      <Chamber
        key="message"
        userId={userId}
        matchId={conversation.id}
        name={match.name}
        prompt={prompt}
        onBack={() => {
          setRecorder(false);
          void refresh();
        }}
      />
    );
  }

  return (
    <section className="conversation-screen" aria-label="Rozhovor">
      <header className="conversation-header flex shrink-0 items-center justify-between gap-3 px-3 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            aria-label="Späť na správy"
            className="conversation-header-action shrink-0"
          >
            <ArrowLeft className="size-5" aria-hidden="true" />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold">{match.name}</h1>
            {match.city && <p className="truncate text-xs text-muted-foreground">{match.city}</p>}
          </div>
        </div>
        {isOpen && (
          <button
            type="button"
            className="conversation-header-action shrink-0"
            aria-label="Možnosti rozhovoru"
            aria-expanded={showOptions}
            aria-controls="conversation-options-panel"
            onClick={() => setShowOptions((open) => !open)}
          >
            <MoreVertical className="size-5" aria-hidden="true" />
          </button>
        )}
      </header>

      {isOpen && (
        <Drawer
          open={showOptions}
          onOpenChange={(open) => {
            setShowOptions(open);
            if (!open) setConfirmClose(false);
          }}
        >
          <DrawerContent
            id="conversation-options-panel"
            className="mx-auto max-w-md border-border bg-card text-foreground"
          >
            <DrawerHeader>
              <DrawerTitle className="font-display text-xl">
                {confirmClose ? "Ukončiť tento rozhovor?" : "Možnosti rozhovoru"}
              </DrawerTitle>
              <DrawerDescription>
                {confirmClose
                  ? "Po ukončení si už v tomto rozhovore nebudete môcť písať."
                  : "Rozhovor môžeš ukončiť kedykoľvek."}
              </DrawerDescription>
            </DrawerHeader>
            {confirmClose ? (
              <DrawerFooter>
                <button
                  type="button"
                  className="personal-action personal-danger w-full"
                  disabled={savingChoice}
                  onClick={() => {
                    setConfirmClose(false);
                    setShowOptions(false);
                    void changeChoice("close");
                  }}
                >
                  Potvrdiť ukončenie
                </button>
                <button
                  type="button"
                  className="personal-action w-full"
                  onClick={() => setConfirmClose(false)}
                >
                  Pokračovať v rozhovore
                </button>
              </DrawerFooter>
            ) : (
              <>
                <div className="grid gap-2 px-4">
                  <button
                    type="button"
                    disabled={savingChoice}
                    className="drawer-option justify-start"
                    onClick={() => setConfirmClose(true)}
                  >
                    Ukončiť rozhovor
                  </button>
                  <details className="rounded-xl bg-muted px-3.5 py-2.5 text-sm">
                    <DisclosureSummary className="font-semibold text-destructive">
                      Nahlásiť a ukončiť
                    </DisclosureSummary>
                    <div className="grid gap-1.5 pt-2">
                      {(
                        Object.entries(REPORT_REASONS) as [keyof typeof REPORT_REASONS, string][]
                      ).map(([reason, label]) => (
                        <button
                          type="button"
                          key={reason}
                          disabled={savingChoice}
                          className="drawer-option"
                          onClick={() => {
                            setShowOptions(false);
                            void changeChoice(reason);
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </details>
                </div>
                <DrawerFooter>
                  <DrawerClose asChild>
                    <button type="button" className="personal-action w-full justify-center">
                      Zavrieť
                    </button>
                  </DrawerClose>
                </DrawerFooter>
              </>
            )}
          </DrawerContent>
        </Drawer>
      )}

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
        {loadFailed && (
          <div role="alert" className="editorial-panel p-4">
            Rozhovor sa nepodarilo načítať.{" "}
            <button type="button" className="underline" onClick={() => void refresh()}>
              Skúsiť znova
            </button>
          </div>
        )}
        {!status && !loadFailed && (
          <div className="space-y-3 py-2" role="status" aria-label="Načítavam rozhovor">
            <Skeleton className="h-20 w-full rounded-2xl" />
            <Skeleton className="h-12 w-3/4 rounded-2xl" />
            <Skeleton className="ml-auto h-12 w-2/3 rounded-2xl" />
          </div>
        )}
        {error && !canSend && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {status?.status === "deleted" && (
          <p role="status" className="editorial-panel p-4">
            Rozhovor je ukončený.
          </p>
        )}

        {isOpen && !hasMessages && sharedQuestion === undefined && (
          <div className="conversation-intro">
            {questionLoadFailed ? (
              <>
                <p role="alert">Spoločnú otázku sa nepodarilo načítať.</p>
                <button
                  type="button"
                  className="personal-action mt-2"
                  onClick={() => void refresh()}
                >
                  Skúsiť znova
                </button>
              </>
            ) : (
              <div className="space-y-2.5" role="status" aria-label="Načítavam spoločnú otázku">
                <Skeleton className="h-4 w-36 rounded-full" />
                <Skeleton className="h-5 w-full rounded-xl" />
                <Skeleton className="h-10 w-44 rounded-full" />
              </div>
            )}
          </div>
        )}
        {isOpen && sharedQuestion?.voice_required && (
          <SharedVoiceQuestion
            matchId={conversation.id}
            name={match.name}
            question={sharedQuestion}
            onChange={updateSharedQuestion}
          />
        )}
        {isOpen && voiceAlertOffer && (
          <section className="conversation-intro" aria-labelledby="voice-alert-heading">
            <h2 id="voice-alert-heading">Chceš vedieť, keď príde hlasová odpoveď?</h2>
            <p className="mt-2 text-sm">
              Na zamknutej obrazovke sa zobrazí len „Máš novú odpoveď“.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="personal-action"
                disabled={voiceAlertOffer === "enabling"}
                onClick={async () => {
                  setVoiceAlertOffer("enabling");
                  try {
                    await enableVoiceAlerts(userId);
                    setVoiceAlertOffer(null);
                  } catch {
                    setVoiceAlertOffer("failed");
                  }
                }}
              >
                {voiceAlertOffer === "enabling" ? "Zapínam…" : "Povoliť upozornenia"}
              </button>
              <button
                type="button"
                className="personal-action"
                disabled={voiceAlertOffer === "enabling"}
                onClick={() => {
                  setVoiceAlertOffer(null);
                  saveVoiceAlertChoice(userId, "dismissed");
                }}
              >
                Teraz nie
              </button>
            </div>
            {voiceAlertOffer === "failed" && (
              <p role="alert" className="mt-2 text-sm text-destructive">
                Upozornenia sa nepodarilo zapnúť. Skús to znova.
              </p>
            )}
          </section>
        )}
        {isOpen && sharedQuestion && !sharedQuestion.voice_required && (
          <SharedConversationQuestion
            matchId={conversation.id}
            name={match.name}
            question={sharedQuestion}
            selected={replyContext !== null && replyContext === sharedQuestion.partner_answer}
            sending={sending}
            onChange={updateSharedQuestion}
            onReply={selectReply}
          />
        )}
        {canSend && !hasMessages && (!sharedQuestion || sharedQuestion.skipped) && (
          <section className="conversation-intro" aria-labelledby="conversation-intro">
            <h2 id="conversation-intro" className="font-semibold">
              {reflection ? "Zdieľaná odpoveď" : "Otázka na úvod"}
            </h2>
            <p className="mt-2 whitespace-pre-wrap break-words text-base leading-relaxed">
              {prompt}
            </p>
            {reflection && (
              <button
                type="button"
                className="personal-action conversation-follow-up"
                aria-pressed={replyContext !== null}
                disabled={sending}
                onClick={() => selectReply(reflection)}
              >
                <Reply className="size-4" aria-hidden="true" />
                Nadviazať
              </button>
            )}
          </section>
        )}

        {isOpen && hasMessages && (
          <details className="conversation-privacy-detail text-sm">
            <DisclosureSummary>
              <span className="flex items-center gap-2">
                <Eye className="size-4 shrink-0" aria-hidden="true" />
                Zdieľanie videí z profilu
              </span>
            </DisclosureSummary>
            {status.is_unlocked ? (
              <>
                <p className="pb-2">Obaja ste súhlasili so zdieľaním profilových videí.</p>
                <button
                  type="button"
                  className="personal-action"
                  aria-expanded={showVideos}
                  onClick={() => setShowVideos((value) => !value)}
                >
                  {showVideos ? "Skryť videá" : "Zobraziť videá"}
                </button>
                {showVideos &&
                  (videosFailed ? (
                    <p role="alert">Videá sa nepodarilo načítať. Skry ich a otvor znova.</p>
                  ) : videos === null ? (
                    <div
                      className="mt-3 grid grid-cols-2 gap-2"
                      role="status"
                      aria-label="Načítavam videá"
                    >
                      <Skeleton className="aspect-[3/4] w-full rounded-2xl" />
                      <Skeleton className="aspect-[3/4] w-full rounded-2xl" />
                    </div>
                  ) : videos.length === 0 ? (
                    <p>Profil nemá dostupné videá.</p>
                  ) : (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {videos.map((url, index) => (
                        <video
                          key={url}
                          src={url}
                          controls
                          playsInline
                          preload="metadata"
                          aria-label={"Profilové video " + (index + 1)}
                          className="w-full rounded-2xl bg-black"
                        />
                      ))}
                    </div>
                  ))}
              </>
            ) : (
              <>
                <p className="pb-2">Videá sa sprístupnia, keď s tým budete obaja súhlasiť.</p>
                {status.consent_pending && (
                  <p role="status" className="pb-2">
                    Súhlas uložený. Čakáme na rozhodnutie druhej osoby.
                  </p>
                )}
                <button
                  type="button"
                  className="personal-action"
                  disabled={savingChoice}
                  onClick={() => void changeChoice(status.consent_pending ? "withdraw" : "share")}
                >
                  {status.consent_pending ? "Odvolať súhlas" : "Súhlasím so zdieľaním videí"}
                </button>
              </>
            )}
          </details>
        )}

        {conversation.messages.map((message) =>
          message.media?.kind === "audio" ? (
            <VoiceBubble
              key={message.id}
              msg={{
                id: message.id,
                from: message.from,
                audioUrl: message.media.url,
                duration: message.media.duration || 0,
              }}
              playing={playing === message.id}
              onToggle={() => setPlaying((value) => (value === message.id ? null : message.id))}
              onEnded={() => setPlaying(null)}
            />
          ) : (
            <div
              key={message.id}
              className={"flex " + (message.from === "me" ? "justify-end" : "justify-start")}
            >
              <div
                className={
                  "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm " +
                  (message.from === "me"
                    ? "bg-accent text-accent-foreground"
                    : "bg-card text-foreground")
                }
              >
                {message.media && (
                  <img
                    src={message.media.url}
                    alt={message.media.label ?? "GIF"}
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    className="max-h-80 max-w-full rounded-xl object-contain"
                  />
                )}
                {message.replyContext && (
                  <blockquote className="mb-2 border-s border-current/40 ps-2 text-sm [overflow-wrap:anywhere]">
                    <span className="sr-only">Reakcia na zdieľanú odpoveď. </span>
                    {message.replyContext}
                  </blockquote>
                )}
                {message.text && (
                  <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{message.text}</p>
                )}
              </div>
            </div>
          ),
        )}
        {showPilotQuestion && <ConversationFeedback matchId={conversation.id} userId={userId} />}
        <div ref={listEnd} />
      </div>

      {needsVoiceAnswer && (
        <footer className="conversation-composer shared-voice-footer">
          <p>
            Max. {QUESTION_VOICE_MAX_SECONDS} sekúnd. Odpovede si vypočujete, keď odpoviete obaja.
          </p>
          <button
            type="button"
            className="match-card-action"
            onClick={() => setRecorder("answer")}
          >
            Nahrať odpoveď
            <Mic size={22} aria-hidden="true" />
          </button>
        </footer>
      )}

      {isOpen && (
        <div className="conversation-composer shrink-0" hidden={!canSend}>
          {canSend && (
            <>
              {replyContext && (
                <div className="conversation-reply-draft">
                  <div id="conversation-reply-context" className="min-w-0">
                    <p className="text-sm font-semibold">Reaguješ na zdieľanú odpoveď</p>
                    <p className="truncate text-sm text-muted-foreground">{replyContext}</p>
                  </div>
                  <button
                    type="button"
                    className="conversation-header-action shrink-0"
                    aria-label="Odstrániť zdieľanú odpoveď zo správy"
                    disabled={sending}
                    onClick={() => selectReply(null)}
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                </div>
              )}
              {error && (
                <div className="flex flex-wrap items-center gap-2 px-3 pt-2">
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                  {canRetrySend && (
                    <button
                      type="button"
                      disabled={sending}
                      onClick={() => void send(failedSend.reaction)}
                      className="personal-action"
                    >
                      Skúsiť znova
                    </button>
                  )}
                </div>
              )}
              {showGifs && (
                <section
                  id="chat-media-picker"
                  className="grid gap-2 px-3 pt-2"
                  aria-label="Katalóg GIFov"
                  onKeyDown={(event) => {
                    if (event.key !== "Escape") return;
                    setShowGifs(false);
                    reactionTrigger.current?.focus({ preventScroll: true });
                  }}
                >
                  <div className="grid gap-1">
                    <input
                      ref={gifSearchInput}
                      type="search"
                      aria-label="Hľadať GIFy"
                      placeholder="Hľadať GIFy…"
                      maxLength={80}
                      value={gifQuery}
                      onChange={(event) => setGifQuery(event.target.value)}
                      className="conversation-input w-full"
                    />
                    {query.length < 2 || search?.live === false ? (
                      <p className="text-xs text-muted-foreground" role="status">
                        {search?.live === false
                          ? "Výsledky z obľúbeného výberu GIFov."
                          : "Odporúčané GIFy"}
                      </p>
                    ) : search ? (
                      <p className="text-xs text-muted-foreground" role="status">
                        {displayedGifs.length ? "Výsledky z KLIPY" : "Žiadne GIFy. Skús iné slovo."}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground" role="status">
                        Hľadám GIFy…
                      </p>
                    )}
                  </div>
                  <div className="grid max-h-[min(16rem,34dvh)] grid-cols-3 gap-2 overflow-y-auto overscroll-contain px-0.5 py-0.5 sm:grid-cols-4">
                    {displayedGifs.map((gif) => (
                      <button
                        type="button"
                        key={gif.url}
                        className="min-h-11 overflow-hidden rounded-2xl border-0 bg-muted"
                        disabled={sending}
                        aria-label={`Odoslať GIF – ${gif.label}`}
                        onClick={() => void send(gif)}
                      >
                        <img
                          src={gif.previewUrl}
                          alt=""
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className="aspect-[3/2] w-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                </section>
              )}
              <form
                className="flex items-end gap-2 p-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void send();
                }}
              >
                <button
                  type="button"
                  className="conversation-header-action"
                  aria-label="Nahrať hlasovú správu"
                  onClick={() => setRecorder("message")}
                  disabled={sending}
                >
                  <Mic className="size-5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="conversation-header-action shrink-0"
                  ref={reactionTrigger}
                  aria-label="GIFy"
                  aria-expanded={showGifs}
                  aria-controls="chat-media-picker"
                  onClick={() => setShowGifs((open) => !open)}
                >
                  <Sparkles className="size-5" aria-hidden="true" />
                </button>
                <textarea
                  ref={composerInput}
                  className="conversation-input"
                  aria-label="Správa"
                  aria-describedby={replyContext ? "conversation-reply-context" : undefined}
                  rows={1}
                  maxLength={2000}
                  value={input}
                  placeholder={replyContext ? "Napíš, čo ťa zaujalo…" : "Napíš správu…"}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      !event.shiftKey &&
                      !event.nativeEvent.isComposing
                    ) {
                      event.preventDefault();
                      void send();
                    }
                  }}
                />
                <button
                  type="submit"
                  aria-label="Odoslať správu"
                  className="conversation-send"
                  disabled={sending || !input.trim()}
                >
                  <Send className="size-4" aria-hidden="true" />
                </button>
              </form>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function mergeMessages(previous: ChatMessage[], incoming: ChatMessage[]) {
  const byId = new Map(previous.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => a.ts - b.ts);
}
