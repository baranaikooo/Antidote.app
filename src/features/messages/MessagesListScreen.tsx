import { ChevronRight, MessageCircle } from "lucide-react";

import { AntidoteLogo } from "@/components/AntidoteLogo";
import { ResonanceAvatar } from "@/components/ResonanceAvatar";
import { Skeleton } from "@/components/ui/skeleton";
import { inboxMessageLabel, type InboxConversation } from "@/lib/conversation-inbox";
import type { ConversationPartner } from "@/lib/conversations";

function formatRelativeInboxTime(ts?: number): string | null {
  if (!ts || !Number.isFinite(ts)) return null;
  const diffMin = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  if (diffMin < 1) return "teraz";
  if (diffMin < 60) return `pred ${diffMin} min`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `pred ${diffHours} h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "včera";
  if (diffDays < 7) return `pred ${diffDays} dňami`;
  return new Date(ts).toLocaleDateString("sk-SK", { day: "numeric", month: "numeric" });
}

export function MessagesList({
  conversations,
  matches,
  failed,
  loading,
  onRetry,
  onOpen,
  onFindNew,
}: {
  conversations: InboxConversation[];
  matches: ConversationPartner[];
  failed: boolean;
  loading: boolean;
  onRetry: () => void;
  onOpen: (id: string) => void;
  onFindNew: () => void;
}) {
  const orderedConversations = [
    ...conversations.filter((conversation) => conversation.questionStage === "your_turn"),
    ...conversations.filter((conversation) => conversation.questionStage !== "your_turn"),
  ];

  return (
    <div className="personal-screen">
      <header className="personal-header">
        <AntidoteLogo markClassName="h-6" />
        <h1 className="personal-title mt-3">Správy</h1>
      </header>

      {failed && (
        <p role="alert" className="mb-3">
          Rozhovory sa nepodarilo načítať.{" "}
          <button type="button" className="underline" onClick={onRetry}>
            Skúsiť znova
          </button>
        </p>
      )}
      {loading && conversations.length === 0 ? (
        <div className="message-list" role="status" aria-label="Načítavam rozhovory">
          {[0, 1, 2].map((item) => (
            <div key={item} className="message-list-row pointer-events-none">
              <Skeleton className="size-12 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-40 max-w-full rounded-full" />
                <Skeleton className="h-3.5 w-56 max-w-full rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : conversations.length === 0 && !failed ? (
        <div className="app-empty">
          <MessageCircle className="size-6" aria-hidden="true" />
          <h2 className="personal-heading mt-2">Zatiaľ žiadne správy</h2>
          <p className="personal-intro">
            Keď jeden z vás odpovie na spoločnú otázku, rozhovor sa objaví tu.
          </p>
        </div>
      ) : (
        <div className="message-list">
          {orderedConversations.map((c) => {
            const m = matches.find((x) => x.id === c.matchId);
            if (!m) return null;
            const last = c.preview;
            const stageLabel = c.questionStage
              ? {
                  your_turn: "Čaká na tvoju odpoveď",
                  waiting: "Tvoja odpoveď je uložená · čakáš na odpoveď",
                  ready: "Obaja ste odpovedali · chat je otvorený",
                }[c.questionStage]
              : "Spoločná otázka";
            const timeLabel = formatRelativeInboxTime(last?.ts ?? c.createdAt);
            return (
              <button
                key={c.id}
                onClick={() => onOpen(c.id)}
                className="message-list-row"
                data-unread={!!c.unread}
              >
                <ResonanceAvatar name={m.name} seed={m.id} unread={Boolean(c.unread)} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className={`truncate text-base ${c.unread ? "font-bold" : "font-medium"}`}
                      >
                        {m.name}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {timeLabel && (
                        <span className="text-xs text-muted-foreground">{timeLabel}</span>
                      )}
                      {c.unread && (
                        <>
                          <span
                            className="size-2 shrink-0 rounded-full bg-accent"
                            aria-hidden="true"
                          />
                          <span className="sr-only">Neprečítané</span>
                        </>
                      )}
                    </div>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {last ? (
                      <span className="block truncate">{inboxMessageLabel(last)}</span>
                    ) : (
                      <span className="message-list-stage" data-stage={c.questionStage}>
                        {stageLabel}
                      </span>
                    )}
                  </p>
                </div>
                <ChevronRight
                  className="size-5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>
      )}

      <button onClick={onFindNew} className="personal-action mt-4 w-full justify-center">
        Nájsť spojenie
      </button>
    </div>
  );
}
