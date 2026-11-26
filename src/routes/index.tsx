import { Capacitor, registerPlugin, SystemBars, SystemBarType } from "@capacitor/core";
import { createFileRoute } from "@tanstack/react-router";
import type { User as AuthUser } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Mic,
  Send,
  Phone,
  ChevronDown,
  Compass,
  Heart,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Play,
  Pause,
  Check,
  X,
  Camera,
  MessageCircle,
  MapPin,
  ArrowLeft,
  Home,
  RefreshCw,
  Radar,
  Trash2,
  Settings as SettingsIcon,
  Sun,
  Moon,
  Shield,
  FileText,
  Cookie,
  Mail,
  Trash,
  Paperclip,
  Image as ImageIcon,
  User,
  MoreVertical,
  AlertTriangle,
} from "lucide-react";
import {
  pickScenarios,
  calcResonance,
  resonanceBreakdown,
  catalystFor,
  orbSeedFor,
  toRankedMatch,
  type RecommendationRow,
  partnerContinueDecision,
  mockReply,
  archetypeOf,
  type Scenario,
  type Answer,
  type Answers,
  type FullAnswers,
  type UserProfile,
  type Gender,
  type Orientation,
  type RankedMatch,
  type Conversation,
  type ChatMessage,
  type Archetype,
  haversineKm,
} from "@/lib/resonance";

import { GoogleSignInButton, type GoogleProfile } from "@/components/GoogleSignInButton";
import { Chip, PillButton, SoftCard, HandNote } from "@/components/Playful";
import { useHaptic } from "@/hooks/use-haptics";
import {
  attachStreamToVideo,
  cameraErrorMessage,
  createMediaRecorder,
  micErrorMessage,
  openCamera,
  openMic,
  pickAudioMime,
  pickVideoMime,
  recordStreamForMs,
  stopStream,
  makeMockToneWavUrl,
  blobToPlayableAudioUrl,
} from "@/lib/media";
import {
  getCurrentUser,
  onAuthStateChange,
  supabase,
  uploadSnippetVideo,
  saveUserProfile,
  fetchUserProfile,
  recordLivenessVerified,
  getOrCreateMatch,
} from "@/lib/supabase";
import { SemanticMirror } from "@/components/SemanticMirror";
import { PRIORITY_CATEGORIES, ValueBankroll } from "@/components/ValueBankroll";
import { ReflectionEditor } from "@/components/ReflectionEditor";
import { fetchConversationPartners, type ConversationPartner } from "@/lib/conversations";
import {
  fetchConversationInbox,
  inboxMessageLabel,
  type InboxConversation,
} from "@/lib/conversation-inbox";
import { IcebreakerDilemma } from "@/components/IcebreakerDilemma";
import { BlindVote } from "@/components/BlindVote";
import { VoiceBubble, VoiceMsg } from "@/components/chat/VoiceBubble";
import { Chamber } from "@/components/chat/VoiceChamber";
import { MessageThread } from "@/components/chat/MessageThread";
import {
  LegalPage,
  TERMS_BODY,
  PRIVACY_BODY,
  COOKIES_BODY,
  CONTACT_BODY,
} from "@/components/settings/LegalAndSettings";
import { AssetDossier } from "@/components/AssetDossier";
import { AntidoteLogo } from "@/components/AntidoteLogo";
import { SystemConfig } from "@/components/SystemConfig";
import { SnippetsOnboarding } from "@/components/SnippetsOnboarding";
import { MatchCardIdentity } from "@/components/MatchCardIdentity";
import { AndroidUpdateProvider, UpdateNotice } from "@/components/UpdateNotice";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { shouldShowMessageAlert } from "@/lib/message-notifications";
import { getVideoBlob, clearVideoBlobs } from "@/lib/indexeddb";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Antidote — Nájdi svoju kognitívnu rezonanciu" },
      {
        name: "description",
        content:
          "Zoznamovacia aplikácia bez swipovania. Overenie tváre a telefónom, párovanie cez 6-otázkový psychologický test, komunikácia výhradne cez hlasovky.",
      },
      { property: "og:title", content: "Antidote — Nájdi svoju kognitívnu rezonanciu" },
      { property: "og:description", content: "Žiadne swipovanie. Iba psychológia." },
    ],
  }),
  component: AntidoteApp,
});

// ============ Shared UI ============
function Wave({ size = 280, intense = false }: { size?: number; intense?: boolean }) {
  return (
    <div
      className="relative grid place-items-center animate-fade-in"
      style={{ width: size, height: size }}
    >
      {[0, 0.6, 1.2].map((d, i) => (
        <span
          key={i}
          className="absolute rounded-full border animate-wave"
          style={{
            width: size * 0.5,
            height: size * 0.5,
            borderColor: "var(--cerebral-border, currentColor)",
            borderWidth: 1,
            animationDelay: `${d}s`,
            opacity: intense ? 0.7 : 0.35,
          }}
        />
      ))}
      <span
        className="absolute rounded-full animate-resonance"
        style={{
          width: size * 0.32,
          height: size * 0.32,
          background: "radial-gradient(circle, var(--cerebral-glow), transparent 70%)",
        }}
      />
      <span
        className="absolute rounded-full bg-foreground shadow-[0_0_6px_var(--cerebral)]"
        style={{ width: 12, height: 12 }}
      />
    </div>
  );
}

function Shell({
  children,
  landing = false,
  main = false,
  thread = false,
  onboardingScreen,
  resumedOnboarding = false,
}: {
  children: React.ReactNode;
  landing?: boolean;
  main?: boolean;
  thread?: boolean;
  onboardingScreen?: Screen;
  resumedOnboarding?: boolean;
}) {
  const onboardingStage = onboardingScreen ? getOnboardingStage(onboardingScreen) : -1;
  const onboarding = onboardingStage >= 0;
  const onboardingStep = onboardingScreen && ONBOARDING_STEP_LABELS[onboardingScreen];
  return (
    <div
      className={`relative h-[100dvh] w-full overflow-hidden ${main ? "app-main" : landing ? "app-welcome" : onboarding ? "app-onboarding" : ""}`}
    >
      {landing && (
        <img
          className="landing-art"
          src="/antidote-fold.jpg"
          alt=""
          width={1536}
          height={1024}
          fetchPriority="high"
        />
      )}
      {/* Subtle ambient top cerebral hairline */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-cerebral/40 to-transparent z-50" />
      <div
        className={`mx-auto h-full max-w-2xl overflow-y-auto overscroll-contain px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${landing ? "landing-viewport" : main ? "app-main-viewport" : thread ? "thread-viewport" : onboarding ? "onboarding-viewport" : "pb-28 pt-5"}`}
      >
        {onboarding && (
          <header className="onboarding-header">
            <AntidoteLogo markClassName="h-6" />
            {onboardingScreen !== "mirror" && (
              <ol className="onboarding-progress" aria-label="Postup registrácie">
                {ONBOARDING_STAGES.map(({ label }, index) => (
                  <li
                    key={label}
                    aria-current={index === onboardingStage ? "step" : undefined}
                    data-reached={index <= onboardingStage}
                  >
                    {label}
                  </li>
                ))}
              </ol>
            )}
            {(resumedOnboarding || onboardingStep) && (
              <p className="onboarding-step" aria-live="polite">
                {resumedOnboarding && <span>Pokračuješ tam, kde si skončil/a</span>}
                {onboardingStep}
              </p>
            )}
          </header>
        )}
        {children}
      </div>
    </div>
  );
}

function AppSplash() {
  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center text-center animate-fade-in">
      <div className="size-16 rounded-full border border-foreground/10 bg-foreground/[0.02] flex items-center justify-center animate-pulse">
        <span className="size-4 rounded-full bg-foreground/40 animate-ping" />
      </div>
      <p className="mt-6 text-sm font-medium text-muted-foreground">Načítavam Antidote…</p>
    </div>
  );
}

// Proactively triggers the browser's native mic permission prompt so the
// microphone shows up in the site's permissions list long before the user
// reaches the voice chamber. Safe to call multiple times — the result is
// cached and tracks are torn down immediately so no recording happens.
let micPrimed: Promise<void> | null = null;
function primeMicPermission(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (micPrimed) return micPrimed;
  if (!navigator.mediaDevices?.getUserMedia) return Promise.resolve();
  micPrimed = (async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // We only wanted the permission grant — release the mic right away.
      stream.getTracks().forEach((t) => t.stop());
      console.info("[voice] microphone permission granted (primed)");
    } catch (err) {
      const e = err as DOMException;
      console.warn("[voice] mic prime skipped:", e?.name, e?.message);
      // Reset so a later explicit start attempt can re-prompt the user.
      micPrimed = null;
    }
  })();
  return micPrimed;
}

// ============ Screens ============
type Screen =
  | "landing"
  | "liveness"
  | "profile"
  | "snippets-onboarding"
  | "briefing"
  | "mirror"
  | "bankroll"
  | "pressure"
  | "test"
  | "processing"
  | "autoMatch"
  | "chamber"
  | "noOne"
  | "messages"
  | "thread"
  | "settings"
  | "legal-terms"
  | "legal-privacy"
  | "legal-cookies"
  | "legal-contact"
  | "profile-dossier";

const ONBOARDING_STAGES: { label: string; screens: Screen[] }[] = [
  { label: "Overenie", screens: ["liveness"] },
  { label: "Profil", screens: ["profile", "snippets-onboarding"] },
  { label: "Dotazník", screens: ["briefing", "mirror", "bankroll", "pressure", "processing"] },
];

const ONBOARDING_STEP_LABELS: Partial<Record<Screen, string>> = {
  liveness: "Overenie kamerou",
  profile: "Základné údaje",
  "snippets-onboarding": "Krátke video do profilu",
  briefing: "Úvod do dotazníka",
  bankroll: "Čo je pre teba dôležité",
  pressure: "Vlastné hodnoty",
  processing: "Výsledok dotazníka",
};

function getOnboardingStage(screen: Screen) {
  return ONBOARDING_STAGES.findIndex(({ screens }) => screens.includes(screen));
}

type ThemeMode = "system" | "dark" | "light";
const AppChrome = registerPlugin<{ setTheme(options: { dark: boolean }): Promise<void> }>(
  "AppChrome",
);

function useTheme(darkChrome: boolean): [ThemeMode, (m: ThemeMode) => void] {
  const [mode, setMode] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "system";
    return (localStorage.getItem("reson:theme") as ThemeMode) || "system";
  });

  useEffect(() => {
    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
    function applyTheme(systemDark: boolean) {
      const dark = mode === "system" ? systemDark : mode === "dark";
      document.documentElement.classList.toggle("dark", dark);
      document.documentElement.classList.toggle("light", !dark);
      if (Capacitor.isPluginAvailable("AppChrome")) {
        void AppChrome.setTheme({ dark: darkChrome || dark }).catch(() => {});
      }
    }

    applyTheme(systemTheme.matches);
    if (Capacitor.getPlatform() === "android" && Capacitor.isPluginAvailable("SystemBars")) {
      void SystemBars.show({ bar: SystemBarType.StatusBar }).catch(() => {});
      void SystemBars.hide({ bar: SystemBarType.NavigationBar }).catch(() => {});
    }
    try {
      localStorage.setItem("reson:theme", mode);
    } catch {
      /* ignore */
    }
    if (mode !== "system") return;
    const onSystemTheme = (event: MediaQueryListEvent) => applyTheme(event.matches);
    systemTheme.addEventListener("change", onSystemTheme);
    return () => systemTheme.removeEventListener("change", onSystemTheme);
  }, [darkChrome, mode]);

  return [mode, setMode];
}

function clearOnboardingStorage(preserveActiveScreen = false) {
  if (typeof window === "undefined") return;
  if (!preserveActiveScreen) {
    localStorage.removeItem("reson:active_screen");
  }
  localStorage.removeItem("reson:profile_step");
  localStorage.removeItem("reson:profile_name");
  localStorage.removeItem("reson:profile_birthDate");
  localStorage.removeItem("reson:profile_age");
  localStorage.removeItem("reson:profile_gender");
  localStorage.removeItem("reson:profile_targetMarket");
  localStorage.removeItem("reson:profile_directiveGoal");
  localStorage.removeItem("reson:profile_directiveRedflags");
  localStorage.removeItem("reson:profile_directiveLifestyle");
  localStorage.removeItem("reson:onboarding_livenessVideoUrl");
  localStorage.removeItem("reson:onboarding_profile_draft");
  localStorage.removeItem("reson:onboarding_cognitiveDepth");
  localStorage.removeItem("reson:onboarding_conscientiousness");
  localStorage.removeItem("reson:onboarding_extraversion");
  localStorage.removeItem("reson:onboarding_attachmentStyle");
  localStorage.removeItem("reson:onboarding_avgResponseTime");
  localStorage.removeItem("reson:onboarding_topPriority");
  localStorage.removeItem("reson:onboarding_previewC");
  localStorage.removeItem("reson:onboarding_previewE");
  localStorage.removeItem("reson:onboarding_hesitated");
  localStorage.removeItem("reson:onboarding_answers");
  localStorage.removeItem("reson:onboarding_user_id");
  clearVideoBlobs().catch((err) =>
    console.error("Failed to clear video blobs from IndexedDB:", err),
  );
}

function AntidoteApp() {
  const [screen, setScreen] = useState<Screen>("landing");
  const onboardingStage = getOnboardingStage(screen);
  const [resumedOnboarding, setResumedOnboarding] = useState<Screen | null>(null);
  const [theme, setTheme] = useTheme(screen === "landing");
  const themeLoadedRef = useRef(false);
  const themeRef = useRef(theme);

  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  const [googleProfile, setGoogleProfile] = useState<GoogleProfile | null>(null);

  const [answers, setAnswers] = useState<Answers>(() => {
    if (typeof window === "undefined") return {};
    const saved = localStorage.getItem("reson:onboarding_answers");
    return saved ? JSON.parse(saved) : {};
  });

  const [livenessVideoUrl, setLivenessVideoUrl] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("reson:onboarding_livenessVideoUrl");
  });

  const [profile, setProfile] = useState<UserProfile | null>(() => {
    if (typeof window === "undefined") return null;
    const saved = localStorage.getItem("reson:onboarding_profile_draft");
    return saved ? JSON.parse(saved) : null;
  });

  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(true);
  const [profileLoadFailed, setProfileLoadFailed] = useState(false);
  const [profileLoadAttempt, setProfileLoadAttempt] = useState(0);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [conversations, setConversations] = useState<InboxConversation[]>([]);
  const [conversationPartners, setConversationPartners] = useState<ConversationPartner[]>([]);
  const [openingMatch, setOpeningMatch] = useState(false);
  const [openError, setOpenError] = useState(false);
  const openingRef = useRef<string | null>(null);
  const [inboxFailed, setInboxFailed] = useState(false);
  const [inboxLoading, setInboxLoading] = useState(true);
  const [inboxRevision, setInboxRevision] = useState(0);

  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  // Psychometric EV variables
  const [cognitiveDepth, setCognitiveDepth] = useState<number>(() => {
    if (typeof window === "undefined") return 0.5;
    const saved = localStorage.getItem("reson:onboarding_cognitiveDepth");
    return saved ? Number(saved) : 0.5;
  });
  const [conscientiousness, setConscientiousness] = useState<number>(() => {
    if (typeof window === "undefined") return 0.5;
    const saved = localStorage.getItem("reson:onboarding_conscientiousness");
    return saved ? Number(saved) : 0.5;
  });
  const [extraversion, setExtraversion] = useState<number>(() => {
    if (typeof window === "undefined") return 0.5;
    const saved = localStorage.getItem("reson:onboarding_extraversion");
    return saved ? Number(saved) : 0.5;
  });
  const [topPriority, setTopPriority] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("reson:onboarding_topPriority") || "";
  });
  const [previewC, setPreviewC] = useState<number>(() => {
    if (typeof window === "undefined") return 0.5;
    const saved = localStorage.getItem("reson:onboarding_previewC");
    return saved ? Number(saved) : 0.5;
  });
  const [previewE, setPreviewE] = useState<number>(() => {
    if (typeof window === "undefined") return 0.5;
    const saved = localStorage.getItem("reson:onboarding_previewE");
    return saved ? Number(saved) : 0.5;
  });
  // Sync to localStorage
  useEffect(() => {
    if (!authUserId || isAuthenticating || screen === "landing") return;
    localStorage.setItem("reson:active_screen", screen);
    if (onboardingStage >= 0) localStorage.setItem("reson:onboarding_user_id", authUserId);
  }, [authUserId, isAuthenticating, onboardingStage, screen]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("reson:onboarding_answers", JSON.stringify(answers));
    }
  }, [answers]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      if (livenessVideoUrl) {
        localStorage.setItem("reson:onboarding_livenessVideoUrl", livenessVideoUrl);
      } else {
        localStorage.removeItem("reson:onboarding_livenessVideoUrl");
      }
    }
  }, [livenessVideoUrl]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      if (profile) {
        localStorage.setItem("reson:onboarding_profile_draft", JSON.stringify(profile));
      } else {
        localStorage.removeItem("reson:onboarding_profile_draft");
      }
    }
  }, [profile]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("reson:onboarding_cognitiveDepth", String(cognitiveDepth));
    }
  }, [cognitiveDepth]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("reson:onboarding_conscientiousness", String(conscientiousness));
    }
  }, [conscientiousness]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("reson:onboarding_extraversion", String(extraversion));
    }
  }, [extraversion]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("reson:onboarding_topPriority", topPriority);
    }
  }, [topPriority]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("reson:onboarding_previewC", String(previewC));
    }
  }, [previewC]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("reson:onboarding_previewE", String(previewE));
    }
  }, [previewE]);

  const userAnswers = answers as FullAnswers;
  const haptic = useHaptic();

  // Handle Supabase auth state changes and initial session check
  useEffect(() => {
    let stopped = false;
    let activeUserId: string | null | undefined;

    // Helper to process session user (load profile, sync theme, etc.)
    async function processSessionUser(user: AuthUser) {
      setIsAuthenticating(true);
      setProfileLoadFailed(false);
      const isCurrent = () => !stopped && activeUserId === user.id;
      const metadata = user.user_metadata;

      // Sync theme from Supabase metadata if exists, otherwise upload current theme
      const savedTheme = metadata?.theme;
      if (savedTheme === "light" || savedTheme === "dark") {
        setTheme(savedTheme);
        themeLoadedRef.current = true;
      } else {
        themeLoadedRef.current = true;
        supabase.auth
          .updateUser({
            data: { theme: themeRef.current },
          })
          .catch((err) => console.warn("[theme] failed to sync to Supabase:", err));
      }

      const profileData: GoogleProfile = {
        name: metadata?.name || metadata?.full_name || user.email?.split("@")[0] || "Používateľ",
        email: user.email || "",
        picture: metadata?.avatar_url || metadata?.picture,
      };
      setGoogleProfile(profileData);

      try {
        setAuthUserId(user.id);
        const existingProfile = await fetchUserProfile(user.id);
        if (!isCurrent()) return;
        const savedScreen = localStorage.getItem("reson:active_screen") as Screen;
        if (existingProfile?.topPriority) {
          setProfile(existingProfile);
          const validMainScreens: Screen[] = ["noOne", "messages", "settings", "profile-dossier"];
          if (savedScreen === "thread") {
            setScreen("messages");
          } else if (savedScreen === "chamber") {
            setScreen("noOne");
          } else {
            setScreen(validMainScreens.includes(savedScreen) ? savedScreen : "noOne");
          }
          clearOnboardingStorage(true);
        } else {
          const draftOwner = localStorage.getItem("reson:onboarding_user_id") ?? profile?.id;
          const hasLocalProfile = draftOwner === user.id && profile?.id === user.id;
          const draftStage = getOnboardingStage(savedScreen);
          const canResume =
            draftOwner === user.id &&
            draftStage >= 0 &&
            (existingProfile ||
              hasLocalProfile ||
              savedScreen === "liveness" ||
              savedScreen === "profile");

          if (existingProfile) setProfile(existingProfile);
          else if (!hasLocalProfile) setProfile(null);

          if (canResume) {
            setResumedOnboarding(savedScreen);
            setScreen(savedScreen);
          } else if (existingProfile) {
            setScreen(
              existingProfile.videoUrls?.some(Boolean) ? "briefing" : "snippets-onboarding",
            );
          } else {
            setScreen("liveness");
          }
        }
      } catch (error) {
        console.error("[Auth] Could not load profile:", error);
        if (isCurrent()) setProfileLoadFailed(true);
      } finally {
        if (isCurrent()) setIsAuthenticating(false);
      }
    }

    const {
      data: { subscription },
    } = onAuthStateChange((event, session) => {
      if (event !== "INITIAL_SESSION" && event !== "SIGNED_IN" && event !== "SIGNED_OUT") return;

      // Profile requests must run after Supabase releases its auth lock.
      window.setTimeout(() => {
        const user = session?.user;
        const userId = user?.id ?? null;
        if (stopped || userId === activeUserId) return;
        activeUserId = userId;

        if (user) {
          if (event === "SIGNED_IN") haptic("success");
          void processSessionUser(user);
        } else {
          setGoogleProfile(null);
          setProfile(null);
          setAuthUserId(null);
          setResumedOnboarding(null);
          openingRef.current = null;
          setOpeningMatch(false);
          setOpenError(false);
          setInboxLoading(true);
          setInboxFailed(false);
          setConversations([]);
          setConversationPartners([]);
          setExcluded(new Set());
          setActiveConversationId(null);
          setScreen("landing");
          setProfileLoadFailed(false);
          setIsAuthenticating(false);
          themeLoadedRef.current = false;
          if (event === "SIGNED_OUT") clearOnboardingStorage();
        }
      }, 0);
    });

    return () => {
      stopped = true;
      subscription.unsubscribe();
    };
  }, [haptic, profileLoadAttempt]);

  // Synchronize theme changes to Supabase user metadata when selected by user
  useEffect(() => {
    if (!themeLoadedRef.current) return;
    getCurrentUser().then((user) => {
      if (user && user.user_metadata?.theme !== theme) {
        supabase.auth
          .updateUser({
            data: { theme: theme },
          })
          .then(() => {
            console.log("[theme] synced to Supabase metadata:", theme);
          })
          .catch((err) => {
            console.warn("[theme] failed to sync to Supabase:", err);
          });
      }
    });
  }, [theme]);

  // Real-time Geolocation watchPosition Stream
  useEffect(() => {
    if (!profile || !authUserId || authUserId === "00000000-0000-0000-0000-000000000001") return;
    if (typeof window === "undefined" || !("geolocation" in navigator)) return;

    let lastSavedCoords: { lat: number; lon: number } | null = profile.coords ?? null;

    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const currentCoords = { lat: latitude, lon: longitude };

        // Distance filter check based on geo_density setting
        let shouldUpdate = false;
        if (!lastSavedCoords) {
          shouldUpdate = true;
        } else {
          const distanceDiff = haversineKm(lastSavedCoords, currentCoords);
          const density = profile.geo_density || "BALANCED_2KM";
          let thresholdKm = 2.0; // default 2km
          if (density === "ECO_5KM") thresholdKm = 5.0;
          else if (density === "HIGH_FREQ_500M") thresholdKm = 0.5;

          if (distanceDiff >= thresholdKm) {
            shouldUpdate = true;
          }
        }

        if (shouldUpdate) {
          console.info(
            `[Geolocation Stream] Location changed. Updating to: [Lat: ${latitude}, Lon: ${longitude}]`,
          );
          lastSavedCoords = currentCoords;

          // Update local state reactively
          setProfile((prev) => (prev ? { ...prev, coords: currentCoords } : null));

          // Update database asynchronously
          const { error } = await supabase
            .from("profiles")
            .update({
              latitude,
              longitude,
            })
            .eq("id", authUserId);

          if (error) {
            console.error("[Geolocation Stream] failed to update location in database:", error);
          }
        }
      },
      (err) => {
        console.warn("[Geolocation Stream] watchPosition error:", err);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      },
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [authUserId, profile?.id, profile?.geo_density]);

  // Real-time Supabase Profile Channel Subscription
  useEffect(() => {
    if (!authUserId || authUserId === "00000000-0000-0000-0000-000000000001") return;

    const channel = supabase
      .channel(`profile-updates:${authUserId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${authUserId}`,
        },
        (payload) => {
          console.log("[Supabase Realtime] User profile updated dynamically:", payload.new);
          const p = payload.new;
          setProfile((prev) => {
            if (!prev) return null;
            return {
              ...prev,
              coords:
                p.latitude && p.longitude ? { lat: p.latitude, lon: p.longitude } : prev.coords,
              haptic_profile: p.haptic_profile || prev.haptic_profile,
              geo_density: p.geo_density || prev.geo_density,
              ui_speed: p.ui_speed || prev.ui_speed,
            };
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [authUserId]);

  // Automatic Geolocation Request & Initial Sync on Login/Auth
  useEffect(() => {
    if (!authUserId || authUserId === "00000000-0000-0000-0000-000000000001") return;
    if (typeof window === "undefined" || !("geolocation" in navigator)) return;

    console.log("[Onboarding GPS] Requesting native geolocation permission on startup...");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        console.log("[Onboarding GPS] Initial coordinates resolved:", latitude, longitude);

        let resolvedCity = "Bratislava";
        try {
          const r = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&accept-language=sk`,
            {
              headers: {
                "User-Agent": "AntidoteApp/1.0",
              },
            },
          );
          if (r.ok) {
            const data = await r.json();
            const a = data?.address ?? {};
            resolvedCity = a.city || a.town || a.village || a.municipality || "Bratislava";
          }
        } catch (e) {
          console.warn("[Onboarding GPS] Reverse geocoding failed, using fallback:", e);
        }

        // Update local state reactively if profile exists
        setProfile((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            coords: { lat: latitude, lon: longitude },
            city: resolvedCity,
          };
        });

        // Update database asynchronously
        const { error } = await supabase
          .from("profiles")
          .update({
            latitude,
            longitude,
            city: resolvedCity,
          })
          .eq("id", authUserId);

        if (error) {
          console.error("[Onboarding GPS] Failed to save initial coordinates:", error);
        } else {
          console.log("[Onboarding GPS] Initial coordinates and city saved successfully.");
        }
      },
      (err) => {
        console.warn("[Onboarding GPS] Initial location prompt rejected/failed:", err);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      },
    );
  }, [authUserId]);

  const [liveCandidates, setLiveCandidates] = useState<RankedMatch[]>([]);
  const [isLoadingMarket, setIsLoadingMarket] = useState(true);
  const [marketFailed, setMarketFailed] = useState(false);
  const [marketRevision, setMarketRevision] = useState(0);

  useEffect(() => {
    if (!profile?.topPriority) return;
    let cancelled = false;

    async function fetchLiveMarket() {
      const p = profile;
      if (!p) return;
      setIsLoadingMarket(true);
      setMarketFailed(false);
      try {
        const { data, error } = await supabase.rpc("get_recommended_matches", {
          max_limit: 100,
        });

        if (error) throw error;

        if (!cancelled) setLiveCandidates(((data ?? []) as RecommendationRow[]).map(toRankedMatch));
      } catch (err) {
        console.error("Market fetch failed:", err);
        if (!cancelled) setMarketFailed(true);
      } finally {
        if (!cancelled) setIsLoadingMarket(false);
      }
    }

    void fetchLiveMarket();
    return () => {
      cancelled = true;
    };
  }, [profile, marketRevision]);

  async function updateSearchRadius(radius: number) {
    const id = profile?.id;
    if (id && id !== "00000000-0000-0000-0000-000000000001") {
      const { error } = await supabase.from("profiles").update({ radius_km: radius }).eq("id", id);
      if (error) throw error;
    }
    setIsLoadingMarket(true);
    setLiveCandidates([]);
    setProfile((current) =>
      current && current.id === id ? { ...current, radiusKm: radius } : current,
    );
    setMarketRevision((revision) => revision + 1);
  }

  const isInboxActive =
    Boolean(profile?.topPriority) &&
    (screen === "messages" ||
      screen === "noOne" ||
      screen === "settings" ||
      screen === "profile-dossier");

  useEffect(() => {
    if (!authUserId || !isInboxActive) return;
    const account = authUserId;
    let active = true;
    let request = 0;
    let debounce: ReturnType<typeof setTimeout> | undefined;

    async function loadInbox() {
      const current = ++request;
      try {
        const inbox = await fetchConversationInbox(account);
        const partners = await fetchConversationPartners(
          inbox.conversations.map((conversation) => conversation.matchId),
        );
        if (!active || current !== request || openingRef.current) return;
        setExcluded(inbox.excluded);
        setConversationPartners(partners);
        setConversations((previous) => {
          const byId = new Map(previous.map((conversation) => [conversation.id, conversation]));
          return inbox.conversations.map((conversation) => ({
            ...conversation,
            messages: byId.get(conversation.id)?.messages ?? [],
          }));
        });
        setInboxFailed(false);
      } catch {
        if (active && current === request) setInboxFailed(true);
      } finally {
        if (active && current === request) setInboxLoading(false);
      }
    }

    function queueRefresh() {
      clearTimeout(debounce);
      debounce = setTimeout(() => void loadInbox(), 100);
    }

    const visible = () => {
      if (document.visibilityState === "visible") queueRefresh();
    };
    const channel = supabase
      .channel("inbox:" + account)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          queueRefresh();
          if (
            payload.new.sender_id &&
            payload.new.sender_id !== account &&
            document.visibilityState === "visible" &&
            shouldShowMessageAlert(account)
          ) {
            toast("Prišla nová správa", {
              id: "new-message",
              action: { label: "Správy", onClick: () => setScreen("messages") },
            });
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "matches", filter: "user_p=eq." + account },
        queueRefresh,
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "matches", filter: "user_q=eq." + account },
        queueRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversation_reads",
          filter: "reader_id=eq." + account,
        },
        queueRefresh,
      )
      .subscribe((state) => {
        if (state === "SUBSCRIBED") queueRefresh();
      });
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("online", visible);
    void loadInbox();
    return () => {
      active = false;
      clearTimeout(debounce);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("online", visible);
      void supabase.removeChannel(channel);
    };
  }, [authUserId, isInboxActive, inboxRevision]);

  const rankedMatches = useMemo(() => {
    if (!profile) return [];
    const currentPartners = new Set(conversations.map((conversation) => conversation.matchId));
    return liveCandidates
      .slice(0, 3)
      .filter((match) => !excluded.has(match.id) && !currentPartners.has(match.id));
  }, [profile, liveCandidates, excluded, conversations]);

  function goToNextMatch() {
    setScreen("noOne");
  }

  async function openIntroduction(match: RankedMatch) {
    if (!authUserId || openingRef.current) return;
    haptic("tap");
    const account = authUserId;
    openingRef.current = match.id;
    setOpeningMatch(true);
    setOpenError(false);
    try {
      const row = await getOrCreateMatch(account, match.id, match.score);
      if (openingRef.current !== match.id) return;
      if (!row || row.status !== "active") {
        setExcluded((previous) => new Set(previous).add(match.id));
        return;
      }
      const [partner] = await fetchConversationPartners([match.id]);
      if (openingRef.current !== match.id) return;
      setConversationPartners((previous) => [
        ...previous.filter((current) => current.id !== match.id),
        partner ?? {
          ...toConversationPartner(match),
          shared_reflection: null,
        },
      ]);
      setConversations((previous) =>
        previous.some((conversation) => conversation.id === row.id)
          ? previous
          : [
              { id: row.id, matchId: match.id, messages: [], unread: false, createdAt: Date.now() },
              ...previous,
            ],
      );
      setActiveConversationId(row.id);
      setScreen("thread");
    } catch {
      if (openingRef.current === match.id) setOpenError(true);
    } finally {
      if (openingRef.current === match.id) {
        openingRef.current = null;
        setOpeningMatch(false);
      }
    }
  }

  const updateActiveConversation = useCallback(
    (patch: (conversation: Conversation) => Conversation) => {
      setConversations((previous) =>
        previous.map((conversation) =>
          conversation.id === activeConversationId ? patch(conversation) : conversation,
        ),
      );
    },
    [activeConversationId],
  );

  const activeConversation = conversations.find(
    (conversation) => conversation.id === activeConversationId,
  );
  const activeConversationMatch = conversationPartners.find(
    (partner) => partner.id === activeConversation?.matchId,
  );
  const activePrompt =
    activeConversationMatch && profile
      ? introductionFor(profile.topPriority, activeConversationMatch)
      : null;

  const unreadConversation = conversations.find((conversation) => conversation.unread);
  const replyPartner = conversationPartners.find(
    (partner) => partner.id === unreadConversation?.matchId,
  );

  function openConversation(id: string) {
    haptic("tap");
    setActiveConversationId(id);
    setScreen("thread");
  }

  function closeActiveConversation() {
    if (activeConversation) {
      setExcluded((previous) => new Set(previous).add(activeConversation.matchId));
      setConversations((previous) =>
        previous.filter((conversation) => conversation.id !== activeConversation.id),
      );
    }
    setActiveConversationId(null);
    setScreen("messages");
  }

  const hasAnswers = Boolean(profile?.topPriority);
  const focusScreens: Screen[] = ["test", "chamber", "thread"];
  const showNav =
    profile !== null &&
    screen !== "landing" &&
    onboardingStage < 0 &&
    !focusScreens.includes(screen);
  const unreadCount = conversations.filter((c) => c.unread).length;

  // Removed proactive mic priming on startup to support Just-in-Time (JIT) permissions

  function goHome() {
    haptic("tap");
    if (profile && hasAnswers) {
      goToNextMatch();
    } else if (profile) {
      setScreen("briefing");
    } else {
      setScreen("landing");
    }
  }
  function goMessages() {
    haptic("tap");
    setScreen("messages");
  }
  function goSettings() {
    haptic("tap");
    setScreen("settings");
  }
  function goProfile() {
    haptic("tap");
    setScreen("profile-dossier");
  }

  const settingsScreens: Screen[] = [
    "settings",
    "legal-terms",
    "legal-privacy",
    "legal-cookies",
    "legal-contact",
  ];
  const navActive =
    screen === "messages" ? "messages" : settingsScreens.includes(screen) ? "settings" : "home";

  if (isAuthenticating) {
    return (
      <Shell>
        <AppSplash />
      </Shell>
    );
  }

  if (profileLoadFailed) {
    return (
      <Shell>
        <section className="personal-screen">
          <h1 className="personal-title">Profil sa nepodarilo načítať</h1>
          <p className="personal-intro">
            Stále si prihlásený. Skontroluj pripojenie a skús to znova.
          </p>
          <button
            type="button"
            className="match-card-action mt-4"
            onClick={() => {
              setIsAuthenticating(true);
              setProfileLoadAttempt((attempt) => attempt + 1);
            }}
          >
            Načítať profil znova
          </button>
        </section>
      </Shell>
    );
  }

  const showUpdateNotice = showNav || Capacitor.getPlatform() === "android";

  return (
    <Shell
      landing={screen === "landing"}
      main={showNav}
      thread={screen === "thread"}
      onboardingScreen={onboardingStage >= 0 ? screen : undefined}
      resumedOnboarding={resumedOnboarding === screen}
    >
      <Toaster theme={theme} position="top-center" />
      <AndroidUpdateProvider enabled={showUpdateNotice}>
        {showUpdateNotice && <UpdateNotice />}
        {screen === "landing" && (
          <Landing
            onGoogle={(profile) => {
              haptic("success");
              setGoogleProfile(profile);
              setScreen("liveness");
            }}
          />
        )}
        {screen === "liveness" && (
          <Liveness
            onDone={async (url) => {
              haptic("success");
              setLivenessVideoUrl(url);
              const targetId = authUserId || (await supabase.auth.getUser()).data.user?.id;
              if (targetId && targetId !== "00000000-0000-0000-0000-000000000001") {
                try {
                  await recordLivenessVerified(url || undefined);
                  console.info("[Onboarding] Liveness verified recorded in Supabase.");
                } catch (err) {
                  console.warn("[Onboarding] recordLivenessVerified failed:", err);
                }
              }
              setScreen("profile");
            }}
          />
        )}
        {screen === "profile" && (
          <ProfileForm
            initialName={googleProfile?.name.split(/\s+/)[0] ?? ""}
            onSubmit={async (p) => {
              haptic("success");
              const targetId =
                authUserId ||
                (await supabase.auth.getUser()).data.user?.id ||
                "00000000-0000-0000-0000-000000000001";
              const newProfile: UserProfile = { ...p, id: targetId, livenessVerified: true };
              setProfile(newProfile);

              // Persist profile to Supabase immediately so account is never lost on refresh
              if (targetId !== "00000000-0000-0000-0000-000000000001") {
                try {
                  await saveUserProfile(targetId, newProfile, []);
                  console.info("[Onboarding] Profile successfully persisted to Supabase.");
                } catch (err) {
                  console.error("[Onboarding] Failed to save profile to Supabase:", err);
                }
              }
              setScreen("snippets-onboarding");
            }}
          />
        )}
        {screen === "snippets-onboarding" && (
          <SnippetsOnboarding
            initialSnippets={profile?.videoUrls}
            onDone={async (urls) => {
              setProfile((prev) => {
                if (!prev) return null;
                return { ...prev, videoUrls: urls };
              });

              // Immediately upload snippets to Supabase Storage and database
              const targetUserId = authUserId || (await supabase.auth.getUser()).data.user?.id;
              if (targetUserId && targetUserId !== "00000000-0000-0000-0000-000000000001") {
                try {
                  const uploadPromises = urls.map(async (url, idx) => {
                    if (!url || !url.startsWith("blob:")) return { slot: idx + 1, url };
                    try {
                      let blob = await getVideoBlob(`snippet_${idx + 1}`);
                      if (!blob) {
                        const res = await fetch(url);
                        blob = await res.blob();
                      }
                      const uploadRes = await uploadSnippetVideo(targetUserId, idx + 1, blob);
                      return { slot: idx + 1, url: uploadRes.url };
                    } catch (err) {
                      console.error(`[Onboarding] Snippet ${idx + 1} upload failed:`, err);
                      return { slot: idx + 1, url: null };
                    }
                  });

                  const results = await Promise.all(uploadPromises);
                  const publicUrls = results
                    .filter((r) => r.url !== null)
                    .map((r) => r.url as string);

                  if (publicUrls.length > 0) {
                    setProfile((prev) => (prev ? { ...prev, videoUrls: publicUrls } : null));
                    const currentProfile = profile || (await fetchUserProfile(targetUserId));
                    if (currentProfile) {
                      await saveUserProfile(
                        targetUserId,
                        { ...currentProfile, videoUrls: publicUrls },
                        publicUrls,
                      );
                    }
                    console.info("[Onboarding] Snippets successfully persisted to Supabase.");
                  }
                } catch (err) {
                  console.warn(
                    "[Onboarding] Immediate snippet upload failed, will sync later:",
                    err,
                  );
                }
              }

              setScreen("briefing");
            }}
          />
        )}
        {screen === "briefing" && (
          <Briefing
            onBegin={() => {
              haptic("tap");
              setScreen("mirror");
            }}
          />
        )}

        {screen === "mirror" && (
          <SemanticMirror
            onDone={(depth) => {
              setCognitiveDepth(depth);
              setScreen("bankroll");
            }}
          />
        )}

        {screen === "bankroll" && (
          <div>
            <ValueBankroll
              userId={authUserId}
              onSliderChange={(c, e) => {
                setPreviewC(c);
                setPreviewE(e);
              }}
              onDone={(c, pList) => {
                try {
                  setConscientiousness(c);

                  const sloboda = pList?.sloboda ?? 0;
                  const rodina = pList?.rodina ?? 0;
                  const kariera = pList?.kariera ?? 0;
                  const kreativita = pList?.kreativita ?? 0;
                  const stabilita = pList?.stabilita ?? 0;

                  const derivedExtraversion =
                    (sloboda * 0.8 +
                      rodina * 0.6 +
                      kariera * 0.5 +
                      kreativita * 0.4 +
                      stabilita * 0.2) /
                    100;
                  setExtraversion(Math.max(0.1, Math.min(0.9, derivedExtraversion || 0.5)));

                  let maxVal = -1;
                  let topKey = "rodina";
                  Object.entries(pList || {}).forEach(([k, v]) => {
                    const val = Number(v) || 0;
                    if (val > maxVal) {
                      maxVal = val;
                      topKey = k;
                    }
                  });
                  setTopPriority(topKey);
                  setScreen("pressure");
                } catch (err) {
                  console.error("[bankroll] onDone failed:", err);
                  setScreen("pressure");
                }
              }}
            />
          </div>
        )}

        {screen === "pressure" &&
          (() => {
            async function finishOnboarding(sharedReflection: string | null) {
              try {
                if (!profile) throw new Error("Profile not initialized");

                // Retrieve the absolute source of truth for the logged-in user ID to prevent RLS mismatches
                const {
                  data: { user: currentUser },
                } = await supabase.auth.getUser();
                const targetUserId = currentUser?.id || authUserId;

                if (!targetUserId) {
                  throw new Error("Používateľská relácia sa nenašla. Prihláste sa znova.");
                }

                // Build the final UserProfile
                const updated: UserProfile = {
                  ...profile,
                  id: targetUserId,
                  cognitiveDepth: cognitiveDepth || 0.5,
                  conscientiousness: conscientiousness || 0.5,
                  extraversion: extraversion || 0.5,
                  topPriority: topPriority || "rodina",
                  sharedReflection,
                };

                // Backend Sync: Batch Upload Videos
                let publicVideoUrls: string[] = [];

                if (targetUserId !== "00000000-0000-0000-0000-000000000001") {
                  if (updated.videoUrls && updated.videoUrls.length > 0) {
                    const uploadPromises = updated.videoUrls.map(async (url, idx) => {
                      if (!url || !url.startsWith("blob:"))
                        return { slot: idx + 1, url, error: null };
                      try {
                        let blob = await getVideoBlob(`snippet_${idx + 1}`);
                        if (!blob) {
                          const res = await fetch(url);
                          blob = await res.blob();
                        }
                        const uploadRes = await uploadSnippetVideo(targetUserId, idx + 1, blob);
                        return { slot: idx + 1, url: uploadRes.url, error: uploadRes.error };
                      } catch (fetchErr: any) {
                        console.error(
                          `[Onboarding] Failed to upload snippet ${idx + 1}:`,
                          fetchErr,
                        );
                        return {
                          slot: idx + 1,
                          url: null,
                          error: fetchErr.message || String(fetchErr),
                        };
                      }
                    });
                    const results = await Promise.all(uploadPromises);

                    const failedUploads = results.filter((r) => r.url === null);
                    if (failedUploads.length > 0) {
                      console.warn(
                        `[Onboarding] ${failedUploads.length} video snippet uploads failed.`,
                      );
                      const firstErr = failedUploads[0].error || "Neznáma chyba";
                      alert(
                        `Niektoré videá sa nepodarilo nahrať. Budete ich môcť pridať neskôr vo vašom profile. Detail chyby: ${firstErr}`,
                      );
                    }

                    // Collect only the successful URLs
                    publicVideoUrls = results
                      .filter((r) => r.url !== null)
                      .map((r) => r.url as string);

                    // Update local profile with public URLs so they don't break on reload
                    updated.videoUrls = publicVideoUrls;
                  }

                  // Backend Sync: Save Profile
                  await saveUserProfile(targetUserId, updated, publicVideoUrls);
                } else {
                  console.warn(
                    "[Demo Mode] Skipping backend upload because user is not signed in.",
                  );
                }

                setProfile(updated);
                // Generate legacy answers for the orb seed from the chosen priorities.
                const derivedAnswers: FullAnswers = {
                  q1: topPriority === "sloboda" ? "A" : "B",
                  q2: (cognitiveDepth || 0.5) > 0.6 ? "A" : "B",
                  q3: topPriority === "stabilita" ? "A" : "B",
                  q4: topPriority === "rodina" ? "A" : "B",
                  q5: (cognitiveDepth || 0.5) > 0.8 ? "A" : "B",
                  q6: (conscientiousness || 0.5) > 0.6 ? "A" : "B",
                };
                setAnswers(derivedAnswers);
                setScreen("processing");
              } catch (error) {
                console.error("[Onboarding] Could not save profile", error);
                throw error;
              }
            }
            return (
              <ReflectionEditor
                initialValue={profile?.sharedReflection}
                onSave={finishOnboarding}
                onSkip={() => finishOnboarding(null)}
              />
            );
          })()}

        {screen === "processing" && (
          <Processing
            seed={orbSeedFor(userAnswers)}
            archetype={archetypeOf(userAnswers)}
            onDone={() => {
              setScreen("noOne");
            }}
          />
        )}
        {screen === "chamber" &&
          activeConversation &&
          activeConversationMatch &&
          authUserId &&
          activePrompt && (
            <Chamber
              userId={authUserId}
              matchId={activeConversation.id}
              name={activeConversationMatch.name}
              prompt={activePrompt.text}
              onBack={() => setScreen("thread")}
            />
          )}
        {screen === "noOne" && profile && (
          <div className="animate-kinetic-fade">
            <Dashboard
              profile={profile}
              matches={rankedMatches}
              loading={isLoadingMarket}
              failed={marketFailed}
              onRefresh={() => {
                setIsLoadingMarket(true);
                setMarketRevision((revision) => revision + 1);
              }}
              onChangeRadius={updateSearchRadius}
              onProfile={goProfile}
              onSelectMatch={openIntroduction}
              openingMatch={openingMatch}
              openError={openError}
              onMessages={() => setScreen("messages")}
              hasMessages={conversations.length > 0}
              recentReply={
                unreadConversation && replyPartner
                  ? {
                      name: replyPartner.name,
                      preview:
                        unreadConversation.preview?.from === "them"
                          ? inboxMessageLabel(unreadConversation.preview)
                          : undefined,
                      onOpen: () => openConversation(unreadConversation.id),
                    }
                  : undefined
              }
            />
          </div>
        )}
        {screen === "messages" && (
          <div className="animate-kinetic-fade">
            <MessagesList
              conversations={conversations}
              matches={conversationPartners}
              failed={inboxFailed}
              loading={inboxLoading}
              onRetry={() => setInboxRevision((previous) => previous + 1)}
              onOpen={openConversation}
              onFindNew={() => {
                haptic("tap");
                goToNextMatch();
              }}
            />
          </div>
        )}
        {screen === "thread" &&
          activeConversation &&
          activeConversationMatch &&
          authUserId &&
          activePrompt && (
            <MessageThread
              key={activeConversation.id}
              conversation={activeConversation}
              match={activeConversationMatch}
              userId={authUserId}
              prompt={activePrompt.text}
              onBack={() => setScreen("messages")}
              onVoice={() => setScreen("chamber")}
              onClose={closeActiveConversation}
              onUpdate={updateActiveConversation}
            />
          )}

        {screen === "settings" && profile && (
          <div className="animate-kinetic-fade">
            <SystemConfig
              user={profile!}
              onUpdateUser={setProfile as React.Dispatch<React.SetStateAction<UserProfile | null>>}
              theme={theme}
              onTheme={(m) => {
                haptic("tap");
                setTheme(m);
              }}
              onOpenTerms={() => setScreen("legal-terms")}
              onOpenPrivacy={() => setScreen("legal-privacy")}
              onOpenCookies={() => setScreen("legal-cookies")}
              onOpenContact={() => setScreen("legal-contact")}
            />
          </div>
        )}
        {screen === "legal-terms" && (
          <LegalPage
            title="Podmienky používania"
            onBack={() => setScreen("settings")}
            body={TERMS_BODY}
          />
        )}
        {screen === "legal-privacy" && (
          <LegalPage
            title="Ochrana súkromia (GDPR)"
            onBack={() => setScreen("settings")}
            body={PRIVACY_BODY}
          />
        )}
        {screen === "legal-cookies" && (
          <LegalPage title="Cookies" onBack={() => setScreen("settings")} body={COOKIES_BODY} />
        )}
        {screen === "legal-contact" && (
          <LegalPage title="Kontakt" onBack={() => setScreen("settings")} body={CONTACT_BODY} />
        )}
        {screen === "profile-dossier" && profile && (
          <div className="animate-kinetic-fade">
            <AssetDossier
              user={profile}
              onBack={() => setScreen("noOne")}
              onUpdateUser={setProfile}
            />
          </div>
        )}

        {showNav && (
          <BottomNav
            active={navActive}
            unread={unreadCount}
            testDone={hasAnswers}
            onHome={goHome}
            onMessages={goMessages}
            onSettings={goSettings}
          />
        )}
      </AndroidUpdateProvider>
    </Shell>
  );
}

function useIsKeyboardOrInputActive() {
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    function handleFocusIn(e: FocusEvent) {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        setIsActive(true);
      }
    }

    function handleFocusOut() {
      setTimeout(() => {
        const active = document.activeElement as HTMLElement | null;
        if (
          !active ||
          (active.tagName !== "INPUT" && active.tagName !== "TEXTAREA" && !active.isContentEditable)
        ) {
          setIsActive(false);
        }
      }, 100);
    }

    function handleViewportResize() {
      if (window.visualViewport) {
        const isShrunk = window.visualViewport.height < window.innerHeight * 0.75;
        if (isShrunk) {
          setIsActive(true);
        } else {
          const active = document.activeElement as HTMLElement | null;
          if (
            !active ||
            (active.tagName !== "INPUT" &&
              active.tagName !== "TEXTAREA" &&
              !active.isContentEditable)
          ) {
            setIsActive(false);
          }
        }
      }
    }

    window.addEventListener("focusin", handleFocusIn);
    window.addEventListener("focusout", handleFocusOut);
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", handleViewportResize);
    }

    return () => {
      window.removeEventListener("focusin", handleFocusIn);
      window.removeEventListener("focusout", handleFocusOut);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", handleViewportResize);
      }
    };
  }, []);

  return isActive;
}

function BottomNav({
  active,
  unread,
  testDone,
  onHome,
  onMessages,
  onSettings,
}: {
  active: "home" | "messages" | "settings";
  unread: number;
  testDone: boolean;
  onHome: () => void;
  onMessages: () => void;
  onSettings: () => void;
}) {
  const isInputActive = useIsKeyboardOrInputActive();
  const items = [
    { id: "home", icon: Home, label: testDone ? "Spojenia" : "Domov", onClick: onHome },
    { id: "messages", icon: MessageCircle, label: "Správy", onClick: onMessages, badge: unread },
    { id: "settings", icon: SettingsIcon, label: "Nastavenia", onClick: onSettings },
  ];

  return (
    <nav
      aria-label="Hlavná navigácia"
      className="app-nav-dock"
      data-hidden={isInputActive}
      inert={isInputActive}
    >
      <div className="app-nav" data-active={active}>
        {items.map(({ id, icon: Icon, label, onClick, badge }) => (
          <button
            key={id}
            type="button"
            onClick={onClick}
            aria-current={id === active ? "page" : undefined}
            className="app-nav-item"
          >
            <span className="app-nav-icon">
              <Icon className="size-5" aria-hidden="true" />
              {!!badge && <span className="app-nav-badge">{badge}</span>}
            </span>
            {label}
          </button>
        ))}
      </div>
    </nav>
  );
}

function Logo() {
  return <AntidoteLogo markClassName="h-9" />;
}

function PrimaryButton({
  children,
  onClick,
  disabled,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`cta-gradient cta-gradient-hover py-4 text-xs tracking-wide font-bold active:scale-[0.97] hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed ${className ?? ""}`}
    >
      <span className="relative z-10 inline-flex items-center justify-center gap-2">
        {children}
      </span>
    </button>
  );
}

function Landing({ onGoogle }: { onGoogle: (profile: GoogleProfile) => void }) {
  const haptic = useHaptic();
  const [choice, setChoice] = useState<"travel" | "love" | null>(null);
  const options = [
    { value: "travel", label: "Možnosť cestovať", icon: Compass },
    { value: "love", label: "Možnosť zamilovať sa", icon: Heart },
  ] as const;

  const choose = (nextChoice: "travel" | "love") => {
    haptic("medium");
    setChoice(nextChoice);
  };

  return (
    <main className="landing-main">
      <div className="landing-hero">
        <header className="landing-intro">
          <div className="landing-brand">
            <AntidoteLogo markClassName="h-8" />
          </div>
          <p>Zoznamka, ktorá začína otázkou.</p>
        </header>
        <h1 className="landing-title">Čo by si radšej stratil/a na jeden rok?</h1>
      </div>
      <div className="landing-interaction" data-answered={choice !== null}>
        <div className="landing-options" role="group" aria-label="Vyber si odpoveď">
          {options.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => choose(value)}
              aria-pressed={choice === value}
              className="landing-option"
            >
              <span className="landing-option-icon" aria-hidden="true">
                <Icon size={21} />
              </span>
              <span>{label}</span>
              <span className="landing-option-state" aria-hidden="true">
                {choice === value && <Check size={19} />}
              </span>
            </button>
          ))}
        </div>
        <div role="status" className="sr-only">
          {choice && "Odpoveď vybraná. Môžeš pokračovať cez Google."}
        </div>
        {choice && (
          <div className="landing-result">
            <p>Podľa odpovedí v dotazníku ti odporučíme ľudí.</p>
            <div className="landing-sign-in">
              <GoogleSignInButton onSuccess={onGoogle} />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = (err) => reject(err);
    document.head.appendChild(script);
  });
}

function Liveness({ onDone }: { onDone: (videoUrl: string | null) => void }) {
  const haptic = useHaptic();
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const stableFramesRef = useRef(0);
  const challengeStepRef = useRef<"center" | "turn_right" | "turn_left" | "done" | "idle">("idle");

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [phase, setPhase] = useState<
    "idle" | "countdown" | "recording" | "verifying" | "ready" | "error"
  >("idle");
  const [countdown, setCountdown] = useState(3);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState("");
  const [faceModel, setFaceModel] = useState<any>(null);
  const [modelLoading, setModelLoading] = useState(true);
  const [challengeStep, setChallengeStep] = useState<
    "center" | "turn_right" | "turn_left" | "done" | "idle"
  >("idle");

  const updateChallengeStep = (val: "center" | "turn_right" | "turn_left" | "done" | "idle") => {
    challengeStepRef.current = val;
    setChallengeStep(val);
  };

  useEffect(() => {
    let active = true;

    async function initModel() {
      try {
        await loadScript("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.20.0/dist/tf.min.js");
        await loadScript(
          "https://cdn.jsdelivr.net/npm/@tensorflow-models/blazeface@0.0.7/dist/blazeface.min.js",
        );

        // @ts-ignore
        const model = await window.blazeface.load();
        if (active) {
          setFaceModel(model);
          setModelLoading(false);
          console.info("[liveness] BlazeFace neural network initialized.");
        }
      } catch (err) {
        console.error("[liveness] Failed to load BlazeFace from CDN:", err);
        if (active) {
          setModelLoading(false);
        }
      }
    }
    initModel();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        stopStream(streamRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !stream || phase === "ready") return;
    attachStreamToVideo(el, stream);
  }, [stream, phase]);

  useEffect(() => {
    if (phase !== "ready" || !recordedUrl) return;
    const el = previewRef.current;
    if (!el) return;
    el.load();
    el.play().catch(() => {
      /* autoplay policy */
    });
  }, [phase, recordedUrl]);

  async function runScan() {
    haptic("tap");
    setPhase("countdown");
    updateChallengeStep("center");
    stableFramesRef.current = 0;

    try {
      const s = await openCamera({
        video: { facingMode: "user" },
        audio: false,
      });
      streamRef.current = s;
      setStream(s);
      await new Promise((r) => setTimeout(r, 150));

      for (let n = 3; n >= 1; n--) {
        setCountdown(n);
        await new Promise((r) => setTimeout(r, 800));
        haptic("tap");
      }

      setPhase("recording");

      const preferred = pickVideoMime();
      const mediaRecorder = createMediaRecorder(s, preferred, "video");
      const chunks: Blob[] = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(250);

      let scanning = true;
      let frameId: number;

      const checkFrame = async () => {
        if (!scanning) return;

        if (videoRef.current && videoRef.current.readyState >= 2) {
          if (faceModel) {
            try {
              const predictions = await faceModel.estimateFaces(videoRef.current, false);
              if (predictions.length === 1) {
                const landmarks = predictions[0].landmarks;
                const rightEar = landmarks[4];
                const leftEar = landmarks[5];
                const nose = landmarks[2];

                if (rightEar && leftEar && nose) {
                  const noseToRight = Math.abs(nose[0] - rightEar[0]);
                  const noseToLeft = Math.abs(nose[0] - leftEar[0]);
                  const ratio = noseToRight / (noseToLeft + 1e-5);

                  const step = challengeStepRef.current;
                  if (step === "center") {
                    if (ratio > 0.65 && ratio < 1.55) {
                      stableFramesRef.current++;
                      if (stableFramesRef.current >= 8) {
                        haptic("tap");
                        stableFramesRef.current = 0;
                        updateChallengeStep("turn_right");
                      }
                    } else {
                      stableFramesRef.current = Math.max(0, stableFramesRef.current - 1);
                    }
                  } else if (step === "turn_right") {
                    if (ratio < 0.45) {
                      stableFramesRef.current++;
                      if (stableFramesRef.current >= 4) {
                        haptic("tap");
                        stableFramesRef.current = 0;
                        updateChallengeStep("turn_left");
                      }
                    }
                  } else if (step === "turn_left") {
                    if (ratio > 2.2) {
                      stableFramesRef.current++;
                      if (stableFramesRef.current >= 4) {
                        haptic("success");
                        stableFramesRef.current = 0;
                        updateChallengeStep("done");
                        scanning = false;
                        finishRecording();
                      }
                    }
                  }
                }
              }
            } catch (err) {
              console.warn("[liveness] frame analysis skipped:", err);
            }
          } else {
            stableFramesRef.current++;
            if (stableFramesRef.current >= 20) {
              haptic("success");
              updateChallengeStep("done");
              scanning = false;
              finishRecording();
            }
          }
        }

        if (scanning) {
          frameId = requestAnimationFrame(checkFrame);
        }
      };

      frameId = requestAnimationFrame(checkFrame);

      const timeoutId = setTimeout(() => {
        if (scanning) {
          scanning = false;
          cancelAnimationFrame(frameId);
          if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
            mediaRecorderRef.current.stop();
          }
          if (streamRef.current) stopStream(streamRef.current);
          streamRef.current = null;
          setStream(null);
          setErrMsg("Časový limit vypršal. Skús znova a pomaly otoč hlavu podľa pokynov.");
          setPhase("error");
          updateChallengeStep("idle");
        }
      }, 25000);

      function finishRecording() {
        clearTimeout(timeoutId);
        cancelAnimationFrame(frameId);

        setPhase("verifying");
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
          mediaRecorderRef.current.onstop = () => {
            const mimeType = mediaRecorderRef.current?.mimeType || "video/webm";
            const blob = chunks.length
              ? new Blob(chunks, { type: mimeType })
              : new Blob([], { type: mimeType });

            if (blob.size > 100) {
              const url = URL.createObjectURL(blob);
              setRecordedUrl(url);
              setPhase("ready");
            } else {
              setErrMsg("Chyba: Záznam videa je prázdny. Skús znovu.");
              setPhase("error");
            }

            if (streamRef.current) stopStream(streamRef.current);
            streamRef.current = null;
            setStream(null);
          };
          mediaRecorderRef.current.stop();
        } else {
          if (streamRef.current) stopStream(streamRef.current);
          streamRef.current = null;
          setStream(null);
          setPhase("error");
        }
      }
    } catch (err) {
      if (streamRef.current) stopStream(streamRef.current);
      setErrMsg("Nahrávanie sa nepodarilo. Skús znova.");
      setPhase("error");
    }
  }

  function retake() {
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedUrl(null);
    setErrMsg("");
    setPhase("idle");
    updateChallengeStep("idle");
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    stopStream(streamRef.current);
    streamRef.current = null;
    setStream(null);
  }

  return (
    <div className="onboarding-panel mx-auto flex w-full max-w-md flex-col items-center text-center animate-fade-up">
      <h2 className="font-display text-2xl font-bold tracking-tight text-foreground mb-2">
        Najprv krátke overenie
      </h2>
      <p className="text-sm text-foreground/75 leading-relaxed mb-4">
        Kameru použijeme na krátke overenie, že si skutočná osoba. Android alebo prehliadač si po
        spustení vyžiada prístup.
      </p>

      <div className="relative my-4 grid place-items-center">
        <div className="relative w-40 max-w-full aspect-[3/4] overflow-hidden rounded-[0.875rem] border border-foreground/25 bg-background">
          {phase !== "ready" && stream && (
            <div className="relative w-full h-full">
              <video
                ref={videoRef}
                playsInline
                muted
                className="w-full h-full object-cover"
                style={{ transform: "scaleX(-1)" }}
              />
              {/* Dashed guide oval */}
              <div className="absolute inset-0 flex flex-col justify-center items-center pointer-events-none">
                <svg className="w-[85%] h-[80%] text-foreground/40" viewBox="0 0 100 100">
                  <ellipse
                    cx="50"
                    cy="50"
                    rx="38"
                    ry="45"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeDasharray="4 3"
                    className={`transition-colors duration-300 ${
                      challengeStep === "center"
                        ? "text-green-500 animate-pulse"
                        : "text-foreground/40"
                    }`}
                  />
                </svg>
              </div>

              {/* Active Step Indicator Overlay */}
              <div className="absolute inset-x-1 bottom-1.5 bg-black/85 border border-foreground/15 px-1.5 py-1 text-center text-xs leading-tight">
                <div className="mb-0.5 font-semibold text-white">Pohyb hlavy</div>
                <div className="flex flex-col gap-0.5 text-left text-white">
                  <div
                    className={
                      challengeStep === "center" ? "text-green-400 font-bold" : "text-white/75"
                    }
                  >
                    {challengeStep === "center" ? "● " : "○ "}1. Pozri do kamery
                  </div>
                  <div
                    className={
                      challengeStep === "turn_right" ? "text-green-400 font-bold" : "text-white/75"
                    }
                  >
                    {challengeStep === "turn_right" ? "● " : "○ "}2. Otoč hlavu doprava
                  </div>
                  <div
                    className={
                      challengeStep === "turn_left" ? "text-green-400 font-bold" : "text-white/75"
                    }
                  >
                    {challengeStep === "turn_left" ? "● " : "○ "}3. Otoč hlavu doľava
                  </div>
                </div>
              </div>
            </div>
          )}
          {phase !== "ready" && !stream && (
            <div className="absolute inset-0 grid place-items-center bg-foreground/5 text-foreground/20">
              {modelLoading ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="size-5 animate-spin border border-foreground border-t-transparent" />
                  <span className="text-xs tracking-wider text-foreground/80 uppercase">
                    Pripravujem overenie…
                  </span>
                </div>
              ) : (
                <Camera className="size-12 text-muted-foreground" aria-hidden="true" />
              )}
            </div>
          )}
          {phase === "ready" && recordedUrl && (
            <video
              ref={previewRef}
              src={recordedUrl}
              autoPlay
              loop
              muted
              playsInline
              className="w-full h-full object-contain"
              style={{ transform: "scaleX(-1)" }}
            />
          )}
          {phase === "countdown" && (
            <div className="absolute inset-0 grid place-items-center bg-foreground/10 backdrop-blur-sm">
              <span className="text-3xl text-foreground font-black tabular-nums">{countdown}</span>
            </div>
          )}
          {phase === "recording" && challengeStep === "done" && (
            <div className="absolute inset-x-0 top-3 mx-auto w-fit bg-red-600 px-2 py-0.5 text-xs tracking-widest text-white uppercase font-bold">
              Nahráva sa
            </div>
          )}
          {phase === "verifying" && (
            <div className="absolute inset-0 bg-foreground/10 pointer-events-none grid place-items-center">
              <span className="text-xs tracking-widest text-foreground animate-pulse font-bold">
                Overujem…
              </span>
            </div>
          )}
        </div>
      </div>

      <p role="status" className="mb-3 text-base text-muted-foreground">
        {phase === "countdown" && "Priprav sa"}
        {phase === "recording" &&
          (challengeStep === "done" ? "Nahrávam video…" : "Postupuj podľa pokynov pri kamere.")}
        {phase === "verifying" && "Overujem video…"}
        {phase === "ready" && "Video je pripravené"}
        {phase === "error" && "Overenie sa nepodarilo"}
      </p>

      {phase === "error" && (
        <p className="text-sm text-destructive mb-4 leading-relaxed">{errMsg}</p>
      )}

      <div className="w-full space-y-2">
        {(phase === "idle" || phase === "error") && (
          <button
            disabled={modelLoading}
            onClick={() => {
              if (phase === "error") retake();
              void runScan();
            }}
            className="w-full bg-foreground text-background font-bold text-sm tracking-wide py-4 hover:bg-foreground/90 disabled:opacity-20 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Camera className="size-4" />
            {modelLoading
              ? "Pripravujem overenie…"
              : phase === "error"
                ? "Skúsiť znova"
                : "Otvoriť kameru"}
          </button>
        )}
        {phase === "ready" && (
          <>
            <button
              onClick={() => onDone(recordedUrl)}
              className="w-full bg-foreground text-background font-bold text-sm tracking-wide py-4 hover:bg-foreground/90 transition-all cursor-pointer"
            >
              Pokračovať
            </button>
            <button
              onClick={retake}
              className="w-full border border-foreground/20 py-3 text-sm tracking-widest text-foreground/60 hover:bg-foreground/5 font-bold uppercase cursor-pointer"
            >
              Zrušiť
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Briefing({ onBegin }: { onBegin: () => void }) {
  return (
    <main className="onboarding-panel mx-auto max-w-md animate-fade-up">
      <h1 className="mb-2 max-w-sm font-display text-[clamp(2.35rem,10vw,3.5rem)] font-extrabold leading-none tracking-[-0.04em]">
        Poďme sa trochu spoznať.
      </h1>
      <p className="text-sm font-medium text-accent">Približne 2 minúty</p>
      <div className="mt-6 border-t border-foreground/20 pt-5 text-muted-foreground">
        <p className="max-w-sm text-base leading-relaxed">
          Čakajú ťa otázky o vzťahoch, hodnotách a o tom, ako sa rozhoduješ. Môžeš si dať čas.
        </p>
        <p className="mt-3 text-sm leading-relaxed">
          Odpovedaj tak, ako to cítiš. Neexistujú správne odpovede.
        </p>
      </div>
      <button
        type="button"
        onClick={onBegin}
        className="tactile-button mt-6 flex min-h-14 w-full items-center justify-between bg-accent p-4 text-left text-accent-foreground"
      >
        <span className="font-display text-xl font-bold">Začať</span>
        <ChevronRight className="size-5" aria-hidden="true" />
      </button>
    </main>
  );
}

function toConversationPartner(match: RankedMatch): ConversationPartner {
  return {
    id: match.id,
    name: match.name,
    age: match.age,
    city: match.city,
    top_priority: match.top_priority,
    shared_reflection: match.shared_reflection ?? null,
  };
}

const PRIORITY_QUESTIONS: Record<string, string> = {
  rodina: "Ako vyzerá blízkosť v tvojom bežnom týždni?",
  kariera: "Kedy sa ti podarilo nájsť čas na niekoho, aj keď ťa práca naplno zamestnávala?",
  stabilita: "Ktorá drobná vec ti vo vzťahu dáva pocit istoty?",
  kreativita: "Čo by si raz chcel/a spolu s niekým vytvoriť?",
  sloboda: "Kedy si sa vo vzťahu cítil/a slobodne a zároveň blízko?",
};

function introductionFor(myPriority: string | undefined, partner: ConversationPartner) {
  const shared =
    partner.top_priority && myPriority === partner.top_priority
      ? PRIORITY_CATEGORIES.find((category) => category.id === myPriority)
      : undefined;
  const text =
    partner.shared_reflection?.trim() ||
    (shared
      ? PRIORITY_QUESTIONS[shared.id]
      : "Ktorú vec o sebe človek pochopí až po dobrom rozhovore s tebou?");
  return { shared, text };
}

function MatchCard({
  match,
  busy,
  onSelect,
}: {
  match: RankedMatch;
  busy: boolean;
  onSelect: () => void;
}) {
  return (
    <article className="match-card">
      <MatchCardIdentity
        name={match.name}
        age={match.age}
        city={match.city}
        distanceKm={match.distanceKm}
      />
      <button type="button" onClick={onSelect} disabled={busy} className="match-card-action">
        {busy ? "Otváram rozhovor…" : "Osloviť"}
        <MessageCircle className="size-5 shrink-0" aria-hidden="true" />
      </button>
    </article>
  );
}

function Dashboard({
  profile,
  matches,
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
  const [radiusChoice, setRadiusChoice] = useState(profile.radiusKm ?? 500);
  const [savingRadius, setSavingRadius] = useState(false);
  const [radiusFailed, setRadiusFailed] = useState(false);
  const nearby = profile.radiusKm !== undefined && profile.radiusKm < 500;
  const searchRange = nearby ? `Do ${profile.radiusKm} km` : "Celý svet";
  const initial = Array.from(profile.name.trim())[0]?.toLocaleUpperCase("sk");

  async function saveSearchRadius() {
    haptic("tap");
    setSavingRadius(true);
    setRadiusFailed(false);
    try {
      await onChangeRadius(radiusChoice);
      setMatchIndex(0);
      setEditingRadius(false);
    } catch {
      setRadiusFailed(true);
    } finally {
      setSavingRadius(false);
    }
  }
  const availableMatches = matches;
  const activeIndex = Math.max(0, Math.min(matchIndex, availableMatches.length - 1));
  const activeMatch = availableMatches[activeIndex];

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
        <h1 className="personal-title">Spojenia</h1>
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
        <section className="match-deck" aria-label="Dnešné odporúčania">
          <MatchCard
            key={activeMatch.id}
            match={activeMatch}
            busy={openingMatch}
            onSelect={() => onSelectMatch(activeMatch)}
          />
          {openError && (
            <p role="alert" className="text-destructive">
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
              </button>
              <div className="match-deck-steps">
                {availableMatches.map(({ id, name }, index) => (
                  <button
                    key={id}
                    type="button"
                    aria-label={`Profil ${index + 1} z ${availableMatches.length}, ${name}`}
                    aria-current={index === activeIndex || undefined}
                    onClick={() => selectProfile(index)}
                  >
                    {index + 1}
                  </button>
                ))}
              </div>
              <button
                type="button"
                aria-label="Ďalší profil"
                disabled={activeIndex === availableMatches.length - 1}
                onClick={() => selectProfile(activeIndex + 1)}
              >
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
            <p className="discover-search-range">
              <MapPin className="size-4" aria-hidden="true" /> {searchRange}
            </p>
            <h2 className="personal-heading">
              {loading
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

          {!failed &&
            !loading &&
            (editingRadius ? (
              <form
                className="discover-radius-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveSearchRadius();
                }}
              >
                <label className="font-semibold" htmlFor="discover-radius">
                  Dosah odporúčaní
                </label>
                <select
                  id="discover-radius"
                  className="min-h-12 rounded-lg border border-foreground/35 bg-card px-3"
                  value={radiusChoice}
                  onChange={(event) => setRadiusChoice(Number(event.target.value))}
                  disabled={savingRadius}
                >
                  {[...new Set([25, 50, 100, 200, profile.radiusKm ?? 500, 500])]
                    .sort((a, b) => a - b)
                    .map((radius) => (
                      <option key={radius} value={radius}>
                        {radius >= 500 ? "Celý svet" : "Do " + radius + " km"}
                      </option>
                    ))}
                </select>
                {radiusFailed && (
                  <p role="alert" className="text-destructive">
                    Dosah sa nepodarilo uložiť. Skús to znova.
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="submit"
                    className="personal-action"
                    disabled={savingRadius || radiusChoice === (profile.radiusKm ?? 500)}
                  >
                    {savingRadius ? "Ukladám…" : "Uložiť dosah"}
                  </button>
                  <button
                    type="button"
                    className="personal-action"
                    disabled={savingRadius}
                    onClick={() => setEditingRadius(false)}
                  >
                    Zrušiť
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                className="match-card-action"
                onClick={() => {
                  setRadiusChoice(profile.radiusKm ?? 500);
                  setRadiusFailed(false);
                  setEditingRadius(true);
                }}
              >
                Zmeniť dosah <ChevronRight className="size-5 shrink-0" aria-hidden="true" />
              </button>
            ))}
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
// ============ Test ============
// Each question runs as a two-phase staggered timer:
//   PHASE 1 "read"   — 10s, only the scenario is visible (answers hidden).
//   PHASE 2 "choose" — 15s, answers fade in and the user must pick (else random).
const READ_TIME = 10;
const CHOOSE_TIME = 15;

function Test({ onComplete }: { onComplete: (a: FullAnswers) => void }) {
  const scenariosRef = useRef<Scenario[]>(pickScenarios());
  const scenarios = scenariosRef.current;
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [phase, setPhase] = useState<"read" | "choose">("read");
  const [timeLeft, setTimeLeft] = useState(READ_TIME);
  const haptic = useHaptic();
  const s = scenarios[idx];
  const answersRef = useRef(answers);
  answersRef.current = answers;

  // Reset both phases on new question.
  useEffect(() => {
    setPhase("read");
    setTimeLeft(READ_TIME);
  }, [idx]);

  // Subtle warning haptic in the last 3 seconds of the choice phase.
  useEffect(() => {
    if (phase === "choose" && timeLeft <= 3 && timeLeft > 0) haptic("warning");
  }, [phase, timeLeft, haptic]);

  function advance(choice: Answer) {
    const next = { ...answersRef.current, [s.id]: choice } as Answers;
    setAnswers(next);
    if (idx === scenarios.length - 1) onComplete(next as FullAnswers);
    else setIdx(idx + 1);
  }

  // Single 1Hz ticker that drives both phases.
  useEffect(() => {
    const t = setInterval(() => {
      setTimeLeft((v) => {
        if (v > 1) return v - 1;
        // Phase transition.
        if (phase === "read") {
          haptic("phase");
          setPhase("choose");
          return CHOOSE_TIME;
        }
        // Phase 2 timeout — force-pick a random answer.
        const pick: Answer = Math.random() < 0.5 ? "A" : "B";
        advance(pick);
        return 0;
      });
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, phase]);

  function pick(choice: Answer) {
    haptic("success");
    advance(choice);
  }

  const total = phase === "read" ? READ_TIME : CHOOSE_TIME;
  const pct = timeLeft / total;
  const danger = phase === "choose" && timeLeft <= 3;

  return (
    <div className="animate-screen-in">
      <div className="mb-8 flex items-end justify-between border-b border-foreground/25 pb-3">
        <div>
          <p className="editorial-kicker text-cerebral">Dilema</p>
          <p className="mt-1 font-display text-2xl font-bold tracking-[-0.04em]">
            {String(idx + 1).padStart(2, "0")} <span className="text-foreground/30">/ 06</span>
          </p>
        </div>
        <div className="text-right">
          <span className="editorial-kicker text-foreground/45">
            {phase === "read" ? "Najprv iba čítaj" : "Teraz sa rozhodni"}
          </span>
          <p className={`mt-1 text-sm font-semibold tabular-nums ${danger ? "text-cerebral" : ""}`}>
            {timeLeft} sek.
          </p>
        </div>
      </div>

      <div className="mb-8 flex gap-1.5" aria-label={`Otázka ${idx + 1} zo ${scenarios.length}`}>
        {scenarios.map((_, step) => (
          <span
            key={step}
            className={`h-2 flex-1 transition-colors ${step <= idx ? "bg-cerebral" : "bg-foreground/10"}`}
          />
        ))}
      </div>

      <div className="mb-6 h-1 w-full overflow-hidden bg-foreground/10">
        <div
          className={`h-full transition-all duration-1000 ease-linear ${danger ? "bg-cerebral" : "bg-accent"}`}
          style={{ width: `${pct * 100}%` }}
        />
      </div>

      <div className="min-h-52 border-y-2 border-foreground py-8">
        <p className="font-display text-[clamp(1.8rem,8vw,2.8rem)] font-bold leading-[1.02] tracking-[-0.04em] text-foreground">
          {s.text}
        </p>
      </div>

      {phase === "read" ? (
        <div className="mt-6 flex items-center gap-3 text-foreground/50">
          <span className="size-2 animate-pulse rounded-full bg-cerebral" />
          <p className="text-sm">Nechaj prvú reakciu prejsť. Možnosti sa objavia o {timeLeft}s.</p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 animate-fade-up">
          {(["a", "b"] as const).map((k) => (
            <button
              key={k}
              onClick={() => pick(k.toUpperCase() as Answer)}
              className={`tactile-button group p-5 text-left cursor-pointer ${
                k === "a"
                  ? "bg-card text-foreground hover:bg-cerebral hover:text-background"
                  : "bg-card text-foreground hover:bg-accent hover:text-accent-foreground"
              }`}
            >
              <span className="flex min-h-14 items-center justify-between gap-4">
                <span className="font-display text-xl font-bold leading-tight">{s[k]}</span>
                <span className="shrink-0 text-sm">{k.toUpperCase()}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============ Processing ============
function Processing({
  seed,
  archetype,
  onDone,
}: {
  seed: ReturnType<typeof orbSeedFor>;
  archetype: Archetype;
  onDone: () => void;
}) {
  void seed;
  useEffect(() => {
    const t = setTimeout(onDone, 3600);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="onboarding-panel mx-auto max-w-md">
      <p className="editorial-kicker text-cerebral">Tvoj profil je hotový</p>
      <h2 className="mt-4 max-w-lg font-display text-5xl font-extrabold leading-[0.92] tracking-[-0.04em] sm:text-6xl">
        Tvoj štýl rozhovoru
      </h2>
      <div className="mt-10 border-y border-foreground/30 py-5">
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-foreground/55">Výsledok</span>
          <span className="font-display text-xl font-bold text-right">{archetype.label}</span>
        </div>
      </div>
      <div className="mt-8 flex gap-2" aria-label="Pripravujem tvoje spojenia">
        {[0, 1, 2, 3, 4].map((step) => (
          <span
            key={step}
            className="h-3 flex-1 animate-pulse bg-cerebral"
            style={{ animationDelay: `${step * 140}ms` }}
          />
        ))}
      </div>
      <p className="mt-4 text-sm text-foreground/50">Hľadáme spojenia podľa tvojich odpovedí.</p>
    </div>
  );
}

// ============ Profile form ============
function ProfileForm({
  onSubmit,
  initialName = "",
}: {
  onSubmit: (p: UserProfile) => void;
  initialName?: string;
}) {
  const haptic = useHaptic();
  const [step, setStep] = useState<
    "SYSTEM_IDENTIFICATION" | "TEMPORAL_MATRIX" | "AGE_VERIFICATION" | "MARKET_ALIGNMENT"
  >(() => {
    if (typeof window === "undefined") return "SYSTEM_IDENTIFICATION";
    return (localStorage.getItem("reson:profile_step") as any) || "SYSTEM_IDENTIFICATION";
  });

  const [name, setName] = useState(() => {
    if (typeof window === "undefined") return initialName.toUpperCase();
    return localStorage.getItem("reson:profile_name") || initialName.toUpperCase();
  });
  const [birthDate, setBirthDate] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("reson:profile_birthDate") || "";
  });
  const [age, setAge] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const saved = localStorage.getItem("reson:profile_age");
    return saved ? Number(saved) : null;
  });
  const [gender, setGender] = useState<Gender | "">(() => {
    if (typeof window === "undefined") return "";
    return (localStorage.getItem("reson:profile_gender") as Gender) || "";
  });
  const [targetMarket, setTargetMarket] = useState<"male" | "female" | "all" | "">(() => {
    if (typeof window === "undefined") return "";
    return (localStorage.getItem("reson:profile_targetMarket") as any) || "";
  });

  // Sync to localStorage
  useEffect(() => {
    localStorage.setItem("reson:profile_step", step);
  }, [step]);
  useEffect(() => {
    localStorage.setItem("reson:profile_name", name);
  }, [name]);
  useEffect(() => {
    localStorage.setItem("reson:profile_birthDate", birthDate);
  }, [birthDate]);
  useEffect(() => {
    if (age !== null) {
      localStorage.setItem("reson:profile_age", String(age));
    } else {
      localStorage.removeItem("reson:profile_age");
    }
  }, [age]);
  useEffect(() => {
    localStorage.setItem("reson:profile_gender", gender);
  }, [gender]);
  useEffect(() => {
    localStorage.setItem("reson:profile_targetMarket", targetMarket);
  }, [targetMarket]);

  // Error flash state
  const [errorFlash, setErrorFlash] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const nameInputRef = useRef<HTMLInputElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);

  // Autofocus input fields on step transitions
  useEffect(() => {
    if (step === "SYSTEM_IDENTIFICATION" && nameInputRef.current) {
      nameInputRef.current.focus();
    } else if (step === "TEMPORAL_MATRIX" && dateInputRef.current) {
      dateInputRef.current.focus();
    }
  }, [step]);

  function calculateAge(birthDateString: string): number {
    if (!birthDateString) return 0;
    const today = new Date();
    const birth = new Date(birthDateString);
    let calculatedAge = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
      calculatedAge--;
    }
    return calculatedAge;
  }

  function handleBirthDateChange(dateString: string) {
    setBirthDate(dateString);
    const calculatedAge = calculateAge(dateString);
    setAge(calculatedAge);
    if (errorMessage) setErrorMessage("");
  }

  function triggerError(msg: string) {
    haptic("warning");
    setErrorMessage(msg);
    setErrorFlash(true);
    setTimeout(() => setErrorFlash(false), 200);
  }

  const nameTrim = name.trim();
  const isNameValid = nameTrim.length >= 2;
  const isDateValid = !!birthDate;
  const isAgeValid = age !== null && age >= 18 && age <= 99;
  const isAlignmentValid = !!gender && !!targetMarket;

  const stepNumber = {
    SYSTEM_IDENTIFICATION: 1,
    TEMPORAL_MATRIX: 2,
    AGE_VERIFICATION: 3,
    MARKET_ALIGNMENT: 4,
  }[step];

  return (
    <div
      className={`personal-screen transition-colors duration-100 ${
        errorFlash ? "bg-red-500/5" : ""
      }`}
    >
      <p className="personal-eyebrow mb-3" role="status">
        Krok {stepNumber} zo 4
      </p>

      {step === "SYSTEM_IDENTIFICATION" && (
        <form
          key="step-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (isNameValid) {
              haptic("tap");
              setStep("TEMPORAL_MATRIX");
              setErrorMessage("");
            } else {
              triggerError("Meno alebo prezývka musí mať aspoň 2 znaky.");
            }
          }}
          className="onboarding-panel"
        >
          <h1 className="personal-title">Predstav sa</h1>
          <p className="personal-intro mb-5">
            Napíš svoje meno alebo prezývku, pod ktorou ťa v aplikácii uvidia ostatní.
          </p>

          <div className="text-left space-y-2">
            <label htmlFor="profile-name" className="mb-2 block font-semibold">
              Meno
            </label>
            <input
              id="profile-name"
              ref={nameInputRef}
              value={name}
              onChange={(e) => {
                setName(e.target.value.toUpperCase().slice(0, 30));
                if (errorMessage) setErrorMessage("");
              }}
              placeholder="Meno alebo prezývka"
              className="w-full border border-foreground/30 bg-card p-3 text-base text-foreground focus:bg-foreground/5"
            />
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="mt-3 border-l-2 border-destructive bg-destructive/10 p-3 font-medium text-destructive"
            >
              {errorMessage}
            </div>
          )}

          <button
            type="submit"
            className="mt-6 w-full bg-foreground py-3.5 font-semibold text-background hover:bg-foreground/90"
          >
            Pokračovať
          </button>
        </form>
      )}

      {step === "TEMPORAL_MATRIX" && (
        <form
          key="step-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (isDateValid) {
              haptic("tap");
              setStep("AGE_VERIFICATION");
              setErrorMessage("");
            } else {
              triggerError("Zadaj dátum narodenia.");
            }
          }}
          className="onboarding-panel"
        >
          <h1 className="personal-title">Kedy máš narodeniny?</h1>
          <p className="personal-intro mb-5">
            Potrebujeme vedieť tvoj dátum narodenia, aby sme ti mohli zobraziť ľudí v správnom veku.
          </p>

          <div className="text-left space-y-2">
            <label htmlFor="profile-birth-date" className="mb-2 block font-semibold">
              Dátum narodenia (DD / MM / RRRR)
            </label>
            <input
              id="profile-birth-date"
              ref={dateInputRef}
              type="date"
              value={birthDate}
              onChange={(e) => handleBirthDateChange(e.target.value)}
              className="w-full border border-foreground/30 bg-card p-3 text-base text-foreground focus:bg-foreground/5"
            />
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="mt-3 border-l-2 border-destructive bg-destructive/10 p-3 font-medium text-destructive"
            >
              {errorMessage}
            </div>
          )}

          <div className="flex gap-2 mt-6">
            <button
              type="button"
              onClick={() => {
                haptic("tap");
                setStep("SYSTEM_IDENTIFICATION");
                setErrorMessage("");
              }}
              className="w-1/3 personal-action"
            >
              Späť
            </button>
            <button
              type="submit"
              className="w-2/3 bg-foreground py-3.5 font-semibold text-background hover:bg-foreground/90"
            >
              Ďalej
            </button>
          </div>
        </form>
      )}

      {step === "AGE_VERIFICATION" && (
        <form
          key="step-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (isAgeValid) {
              haptic("success");
              setStep("MARKET_ALIGNMENT");
              setErrorMessage("");
            } else {
              triggerError("Skontroluj dátum narodenia. Zadaný vek musí byť od 18 do 99 rokov.");
            }
          }}
          className="onboarding-panel"
        >
          <h1 className="personal-title">Skontroluj si vek</h1>
          <p className="personal-intro mb-5">
            Podľa dátumu narodenia sme vypočítali tvoj vek. Sedí to?
          </p>

          <div className="text-left space-y-4">
            <div className="border-y border-foreground/20 bg-foreground/5 p-4">
              <p className="font-semibold">Tvoj vek: {age ?? "?"}</p>
            </div>
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="mt-3 border-l-2 border-destructive bg-destructive/10 p-3 font-medium text-destructive"
            >
              {errorMessage}
            </div>
          )}

          <div className="flex gap-2 mt-6">
            <button
              type="button"
              onClick={() => {
                haptic("tap");
                setStep("TEMPORAL_MATRIX");
                setErrorMessage("");
              }}
              className="w-1/3 personal-action"
            >
              Späť
            </button>
            <button
              type="submit"
              className="w-2/3 bg-foreground py-3.5 font-semibold text-background hover:bg-foreground/90"
            >
              Potvrdiť vek
            </button>
          </div>
        </form>
      )}

      {step === "MARKET_ALIGNMENT" && (
        <form
          key="step-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (isAlignmentValid) {
              haptic("success");
              setErrorMessage("");

              // Calculate orientation based on gender & targetMarket mapping
              let calculatedOrientation: Orientation = "bi";
              if (targetMarket === "all" || gender === "other") {
                calculatedOrientation = "bi";
              } else if (gender === targetMarket) {
                calculatedOrientation = "homo";
              } else {
                calculatedOrientation = "hetero";
              }

              onSubmit({
                name: nameTrim,
                age: age || 18,
                birthDate: birthDate,
                city: "Bratislava", // Default city fallback (updated in real-time by WatchPosition)
                gender: gender as Gender,
                orientation: calculatedOrientation,
                radiusKm: 250,
              });
            } else {
              triggerError("Vyber, ako sa chceš uvádzať a koho hľadáš.");
            }
          }}
          className="onboarding-panel"
        >
          <h1 className="personal-title">Koho chceš spoznať?</h1>
          <p className="personal-intro mb-5">
            Zvoľ svoje pohlavie a vyber si, koho v aplikácii hľadáš.
          </p>

          <div className="text-left space-y-4">
            <div>
              <p className="mb-2 font-semibold">Ja som</p>
              <div className="personal-segments" role="group" aria-label="Ja som">
                {(
                  [
                    { value: "male", label: "Muž" },
                    { value: "female", label: "Žena" },
                    { value: "other", label: "Nebinárna osoba" },
                  ] as const
                ).map((g) => (
                  <button
                    key={g.value}
                    type="button"
                    onClick={() => {
                      haptic("tap");
                      setGender(g.value);
                      if (errorMessage) setErrorMessage("");
                    }}
                    aria-pressed={gender === g.value}
                    className="personal-segment"
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 font-semibold">Hľadám</p>
              <div className="personal-segments" role="group" aria-label="Hľadám">
                {(
                  [
                    { value: "male", label: "Mužov" },
                    { value: "female", label: "Ženy" },
                    { value: "all", label: "Všetkých" },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => {
                      haptic("tap");
                      setTargetMarket(t.value);
                      if (errorMessage) setErrorMessage("");
                    }}
                    aria-pressed={targetMarket === t.value}
                    className="personal-segment"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="mt-3 border-l-2 border-destructive bg-destructive/10 p-3 font-medium text-destructive"
            >
              {errorMessage}
            </div>
          )}

          <div className="flex gap-2 mt-6">
            <button
              type="button"
              onClick={() => {
                haptic("tap");
                setStep("AGE_VERIFICATION");
                setErrorMessage("");
              }}
              className="w-1/3 personal-action"
            >
              Späť
            </button>
            <button
              type="submit"
              className="w-2/3 bg-foreground py-3.5 font-semibold text-background hover:bg-foreground/90"
            >
              Dokončiť profil
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// ============ NoOne ============
function NoOne({ onMessages }: { onMessages: (() => void) | null }) {
  return (
    <div className="flex min-h-[80vh] flex-col px-1 py-3 animate-fade-up">
      <header>
        <Logo />
      </header>
      <main className="my-auto py-10">
        <p className="editorial-kicker text-foreground/50">Tvoje spojenia</p>
        <h1 className="mt-5 max-w-sm font-display text-[clamp(2.35rem,10vw,4.6rem)] font-extrabold leading-[0.96] tracking-[-0.04em]">
          Žiadne nové spojenia
        </h1>
        <div className="mt-8 border-t border-foreground/30 pt-6">
          <p className="max-w-sm text-sm leading-relaxed text-foreground/60">
            Momentálne sme nenašli ďalšie vhodné spojenie. Skús sa vrátiť neskôr.
          </p>
          {onMessages && (
            <button
              type="button"
              onClick={onMessages}
              className="tactile-button mt-8 flex min-h-20 w-full items-center justify-between bg-foreground p-5 text-left text-background"
            >
              <span className="font-display text-xl font-bold">Otvoriť správy</span>
              <ChevronRight className="size-5" aria-hidden="true" />
            </button>
          )}
        </div>
      </main>
    </div>
  );
}

// ============ Chamber (voice 5 min → ContinueGate) ============
const BLUR_START = 24;
const BLUR_STEP = 3;
const MAX_REC_SECONDS = 60;

// ============ Messages list ============
function MessagesList({
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
        <p role="status">Načítavam rozhovory…</p>
      ) : conversations.length === 0 && !failed ? (
        <div className="app-empty">
          <MessageCircle className="size-6" aria-hidden="true" />
          <h2 className="personal-heading mt-2">Zatiaľ žiadne správy</h2>
          <p className="personal-intro">Tu nájdeš rozhovor, keď jeden z vás odošle prvú správu.</p>
        </div>
      ) : (
        <div className="message-list">
          {conversations.map((c) => {
            const m = matches.find((x) => x.id === c.matchId);
            if (!m) return null;
            const last = c.preview;
            return (
              <button
                key={c.id}
                onClick={() => onOpen(c.id)}
                className="message-list-row group"
                data-unread={!!c.unread}
              >
                <span
                  className="grid size-12 shrink-0 place-items-center rounded-full bg-muted font-bold"
                  aria-hidden="true"
                >
                  {Array.from(m.name)[0]?.toLocaleUpperCase("sk")}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className={`truncate text-base ${c.unread ? "font-bold" : "font-medium"}`}>
                      {m.name}
                    </h3>
                    <span className="shrink-0 text-sm text-muted-foreground">{m.age}</span>
                    <span className="truncate text-sm text-muted-foreground">· {m.city}</span>
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
                  <p className="mt-1 flex items-center gap-2 text-sm text-foreground/70">
                    <span className="truncate">
                      {last ? inboxMessageLabel(last) : "Otvoriť rozhovor"}
                    </span>
                  </p>
                </div>
                <ChevronRight className="size-5 shrink-0 text-foreground/30 group-hover:text-foreground" />
              </button>
            );
          })}
        </div>
      )}

      <button onClick={onFindNew} className="personal-action mt-4 w-full">
        Nájsť spojenie
      </button>
    </div>
  );
}

// Mock GIF search results — small, loopable preview GIFs hosted on a CDN.
const MOCK_GIFS: string[] = [
  "https://media.tenor.com/x8v1oNUOmg4AAAAi/heart-love.gif",
  "https://media.tenor.com/Mxv-AaTHraEAAAAi/wave-hello.gif",
  "https://media.tenor.com/I6kN-6X2HgAAAAAi/sparkle-stars.gif",
  "https://media.tenor.com/CzZjqUyVx8gAAAAi/cat-laptop.gif",
  "https://media.tenor.com/sj7y9LDsQ_kAAAAi/dance-party.gif",
  "https://media.tenor.com/L4Yh1c6jw7AAAAAi/cool-sunglasses.gif",
];
const REPLY_TYPING_MS = 1400;

// ============ Settings + Legal ============
