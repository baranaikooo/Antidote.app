import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Mic,
  Send,
  Phone,
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
  Brain,
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
  rankMatches,
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
} from "@/lib/supabase";
import { initializeBanditState } from "@/lib/resonance";
import { SemanticMirror } from "@/components/SemanticMirror";
import { ValueBankroll } from "@/components/ValueBankroll";
import { PressureChat, SCENARIOS } from "@/components/PressureChat";
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
          background:
            "radial-gradient(circle, var(--cerebral-glow), transparent 70%)",
        }}
      />
      <span
        className="absolute rounded-full bg-foreground shadow-[0_0_6px_var(--cerebral)]"
        style={{ width: 12, height: 12 }}
      />
    </div>
  );
}

function Shell({ children, landing = false, main = false }: { children: React.ReactNode; landing?: boolean; main?: boolean }) {
  return (
    <div className={`relative h-[100dvh] w-full overflow-hidden ${main ? "app-main" : ""}`}>
      {/* Subtle ambient top cerebral hairline */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-cerebral/40 to-transparent z-50" />
      <div className={`mx-auto h-full max-w-2xl overflow-y-auto overscroll-contain px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${landing ? "landing-viewport" : "pb-28 pt-5"}`}>
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
      <p className="mt-6 font-mono text-xs tracking-[0.32em] text-foreground/45 uppercase">
        Načítavam Antidote…
      </p>
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

type ThemeMode = "system" | "dark" | "light";
function useTheme(): [ThemeMode, (m: ThemeMode) => void] {
  const [mode, setMode] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "system";
    return (localStorage.getItem("reson:theme") as ThemeMode) || "system";
  });

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.classList.remove("dark", "light");
    if (mode === "system") {
      const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      document.documentElement.classList.add(isDark ? "dark" : "light");
    } else {
      document.documentElement.classList.add(mode);
    }
    try {
      localStorage.setItem("reson:theme", mode);
    } catch {
      /* ignore */
    }
  }, [mode]);

  useEffect(() => {
    if (mode !== "system" || typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      document.documentElement.classList.remove("dark", "light");
      document.documentElement.classList.add(e.matches ? "dark" : "light");
    };
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, [mode]);

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
  clearVideoBlobs().catch((err) =>
    console.error("Failed to clear video blobs from IndexedDB:", err),
  );
}

function AntidoteApp() {
  const [theme, setTheme] = useTheme();
  const themeLoadedRef = useRef(false);
  const themeRef = useRef(theme);

  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  const [screen, setScreen] = useState<Screen>("landing");
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
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);

  const [activeConversationId, setActiveConversationId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("reson:activeConversationId");
  });

  const [sortBy, setSortBy] = useState<"ev" | "distance">("ev");

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
  const [attachmentStyle, setAttachmentStyle] = useState<string>(() => {
    if (typeof window === "undefined") return "Secure";
    return localStorage.getItem("reson:onboarding_attachmentStyle") || "Secure";
  });
  const [avgResponseTime, setAvgResponseTime] = useState<number>(() => {
    if (typeof window === "undefined") return 3.0;
    const saved = localStorage.getItem("reson:onboarding_avgResponseTime");
    return saved ? Number(saved) : 3.0;
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
  const [hesitated, setHesitated] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("reson:onboarding_hesitated") === "true";
  });
  const [redemptionQuota, setRedemptionQuota] = useState<number>(0);

  // Sync to localStorage
  useEffect(() => {
    if (typeof window !== "undefined" && screen && screen !== "landing") {
      localStorage.setItem("reson:active_screen", screen);
    }
  }, [screen]);

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
      if (activeConversationId) {
        localStorage.setItem("reson:activeConversationId", activeConversationId);
      } else {
        localStorage.removeItem("reson:activeConversationId");
      }
    }
  }, [activeConversationId]);

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
      localStorage.setItem("reson:onboarding_attachmentStyle", attachmentStyle);
    }
  }, [attachmentStyle]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("reson:onboarding_avgResponseTime", String(avgResponseTime));
    }
  }, [avgResponseTime]);

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

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("reson:onboarding_hesitated", String(hesitated));
    }
  }, [hesitated]);

  const reduceRedemptionQuota = () => {
    setRedemptionQuota((prev) => {
      const next = Math.max(0, prev - 1);
      if (profile) {
        setProfile({
          ...profile,
          redemptionQuota: next,
        });
      }
      return next;
    });
  };

  const userAnswers = answers as FullAnswers;
  const haptic = useHaptic();

  // Initialize ML Bandit
  useEffect(() => {
    initializeBanditState().catch((err) => console.error("Failed to init bandit state:", err));
  }, []);

  // Handle Supabase auth state changes and initial session check
  useEffect(() => {
    let initialized = false;

    // Helper to process session user (load profile, sync theme, etc.)
    async function processSessionUser(user: any) {
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
      haptic("success");

      try {
        setAuthUserId(user.id);
        const existingProfile = await fetchUserProfile(user.id);
        if (existingProfile) {
          setProfile(existingProfile);
          const savedScreen = localStorage.getItem("reson:active_screen") as Screen;
          const validMainScreens: Screen[] = [
            "chamber",
            "noOne",
            "messages",
            "settings",
            "profile-dossier",
            "thread",
            "autoMatch",
          ];
          if (savedScreen && validMainScreens.includes(savedScreen)) {
            setScreen(savedScreen);
          } else {
            setScreen("autoMatch");
          }
          clearOnboardingStorage(true);
        } else {
          const savedScreen = localStorage.getItem("reson:active_screen") as Screen;
          const validOnboardingScreens: Screen[] = [
            "liveness",
            "profile",
            "snippets-onboarding",
            "briefing",
            "mirror",
            "bankroll",
            "pressure",
            "processing",
          ];
          if (savedScreen && validOnboardingScreens.includes(savedScreen)) {
            setScreen(savedScreen);
          } else {
            setScreen("liveness");
          }
        }
      } catch (err: any) {
        console.error("[Auth Debug] fetchUserProfile crashed:", err);
        const savedScreen = localStorage.getItem("reson:active_screen") as Screen;
        const validOnboardingScreens: Screen[] = [
          "liveness",
          "profile",
          "snippets-onboarding",
          "briefing",
          "mirror",
          "bankroll",
          "pressure",
          "processing",
        ];
        if (savedScreen && validOnboardingScreens.includes(savedScreen)) {
          setScreen(savedScreen);
        } else {
          setScreen("liveness");
        }
      } finally {
        setIsAuthenticating(false);
      }
    }

    // 1. Initial auth check on mount (prevents landing flash)
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const user = await getCurrentUser();
        if (user) {
          await processSessionUser(user);
        } else {
          setScreen("landing");
          setIsAuthenticating(false);
        }
      } else {
        setScreen("landing");
        setIsAuthenticating(false);
      }
      initialized = true;
    });

    // 2. Auth changes subscription for subsequent updates
    const {
      data: { subscription },
    } = onAuthStateChange((event, session) => {
      console.log("[auth] auth state changed:", event, session?.user?.email);

      if (event === "USER_UPDATED") {
        return; // Ignore metadata updates (e.g. theme sync) to prevent accidental logouts
      }

      if (!initialized) return; // Skip initial events, getSession handles the mount logic!

      setTimeout(async () => {
      if (session?.user) {
        const user = await getCurrentUser();
        if (user) {
          await processSessionUser(user);
        } else {
          setGoogleProfile(null);
          setProfile(null);
          setAuthUserId(null);
          setScreen("landing");
          themeLoadedRef.current = false;
          clearOnboardingStorage();
        }
      } else {
        setGoogleProfile(null);
        setProfile(null);
        setAuthUserId(null);
        setScreen("landing");
        themeLoadedRef.current = false;
        clearOnboardingStorage();
      }
      }, 0);
    });

    return () => subscription.unsubscribe();
  }, [haptic]);

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
  const [initiatedMatchIds, setInitiatedMatchIds] = useState<Set<string>>(new Set());
  const [isLoadingMarket, setIsLoadingMarket] = useState(false);

  useEffect(() => {
    if (!profile) return;

    async function fetchLiveMarket() {
      const p = profile;
      if (!p) return;
      setIsLoadingMarket(true);
      try {
        const { data, error } = await supabase.rpc("get_recommended_matches", {
          caller_id: p.id,
          caller_gender: p.gender || "other",
          caller_orientation: p.orientation || "bi",
          caller_vector: `[${p.cognitiveDepth || 0.5},${p.conscientiousness || 0.5}]`,
          max_limit: 100,
        });

        if (error) throw error;

        // Map Supabase rows to RankedMatch interface
        const mapped: RankedMatch[] = (data || []).map((row: any) => ({
          id: row.id,
          name: row.name,
          age: row.age,
          city: row.city,
          gender: row.gender as Gender,
          orientation: row.orientation as Orientation,
          bio: "",
          img: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=800&q=80",
          answers: { q1: "A", q2: "A", q3: "A", q4: "A", q5: "A", q6: "A" },
          cognitive_depth: row.cognitive_depth,
          conscientiousness: row.conscientiousness,
          extraversion: row.extraversion,
          attachment_style: row.attachment_style || "Secure",
          avg_response_time: row.avg_response_time || 3.0,
          top_priority: row.top_priority || "",
          distanceKm: row.distance ? Math.round(row.distance * 100) : undefined,
          coords:
            row.latitude && row.longitude ? { lat: row.latitude, lon: row.longitude } : undefined,
        }));

        setLiveCandidates(mapped);

        // Fetch matches where user is a participant to check for sent messages
        const { data: myMatches } = await supabase
          .from("matches")
          .select("id, user_p, user_q")
          .or(`user_p.eq.${p.id},user_q.eq.${p.id}`);

        const matchIdToPartnerId = new Map<string, string>();
        if (myMatches) {
          myMatches.forEach((m: any) => {
            const partnerId = m.user_p === p.id ? m.user_q : m.user_p;
            matchIdToPartnerId.set(m.id, partnerId);
          });
        }

        const matchIds = Array.from(matchIdToPartnerId.keys());
        const initiatedPartners = new Set<string>();

        if (matchIds.length > 0) {
          const { data: sentMessages } = await supabase
            .from("messages")
            .select("match_id")
            .in("match_id", matchIds)
            .eq("sender_id", p.id);

          if (sentMessages) {
            sentMessages.forEach((msg: any) => {
              const partnerId = matchIdToPartnerId.get(msg.match_id);
              if (partnerId) {
                initiatedPartners.add(partnerId);
              }
            });
          }
        }
        setInitiatedMatchIds(initiatedPartners);
      } catch (err) {
        console.error("Market fetch failed:", err);
      } finally {
        setIsLoadingMarket(false);
      }
    }
    fetchLiveMarket();
  }, [profile]);

  const rankedMatches = useMemo(() => {
    if (!profile) return [];
    const baseMatches = rankMatches(profile, liveCandidates);
    if (sortBy === "distance") {
      return [...baseMatches].sort((a, b) => {
        const distA = a.distanceKm ?? 9999;
        const distB = b.distanceKm ?? 9999;
        return distA - distB;
      });
    }
    return baseMatches;
  }, [profile, sortBy, liveCandidates]);

  const inConversation = useMemo(
    () => new Set(conversations.map((c) => c.matchId)),
    [conversations],
  );

  function pickNextMatch(): RankedMatch | null {
    return rankedMatches.find((m) => !excluded.has(m.id) && !inConversation.has(m.id)) ?? null;
  }

  function goToNextMatch() {
    setScreen("noOne");
  }

  function onChamberSuccess(match: RankedMatch, blurLevel: number) {
    const conv: Conversation = {
      id: `c-${match.id}-${Date.now()}`,
      matchId: match.id,
      blurLevel,
      messages: [],
      unread: false,
      createdAt: Date.now(),
    };
    setConversations((cs) => [conv, ...cs]);
    setActiveConversationId(conv.id);
    setScreen("thread");
  }

  function onChamberDiscard(matchId: string) {
    setExcluded((s) => new Set(s).add(matchId));
    setActiveMatchId(null);
    setScreen("noOne");
    setRedemptionQuota(3);
    if (profile) {
      setProfile({
        ...profile,
        redemptionQuota: 3,
      });
    }
    haptic("warning");
  }

  function updateConversation(id: string, patch: (c: Conversation) => Conversation) {
    setConversations((cs) => cs.map((c) => (c.id === id ? patch(c) : c)));
  }

  function endConversation(id: string) {
    const c = conversations.find((x) => x.id === id);
    if (c) setExcluded((s) => new Set(s).add(c.matchId));
    setConversations((cs) => cs.filter((x) => x.id !== id));
    setActiveConversationId(null);
    setScreen("messages");
  }

  const activeMatch = activeMatchId
    ? (rankedMatches.find((m) => m.id === activeMatchId) ?? null)
    : null;
  const activeConversation = activeConversationId
    ? (conversations.find((c) => c.id === activeConversationId) ?? null)
    : null;
  const activeConversationMatch = activeConversation
    ? (liveCandidates.find((m) => m.id === activeConversation.matchId) ?? null)
    : null;

  const hasAnswers = profile?.cognitiveDepth !== undefined;
  const onboardingScreens: Screen[] = [
    "landing",
    "liveness",
    "profile",
    "snippets-onboarding",
    "briefing",
    "mirror",
    "bankroll",
    "pressure",
  ];
  const focusScreens: Screen[] = ["test", "chamber", "thread"];
  const showNav =
    profile !== null && !onboardingScreens.includes(screen) && !focusScreens.includes(screen);
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
  function goTest() {
    haptic("tap");
    if (!profile) {
      setScreen("landing");
      return;
    }
    // Once the cognitive test is complete, lock re-entry — the user keeps
    // their original Cognitive DNA and the Test icon is hidden from the nav.
    if (hasAnswers) {
      goToNextMatch();
      return;
    }
    setAnswers({});
    setScreen("briefing");
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

  const navActive: "home" | "test" | "messages" | "settings" | "profile" =
    screen === "messages"
      ? "messages"
      : screen === "profile-dossier"
        ? "profile"
        : (
              [
                "settings",
                "legal-terms",
                "legal-privacy",
                "legal-cookies",
                "legal-contact",
              ] as Screen[]
            ).includes(screen)
          ? "settings"
          : "home";

  if (isAuthenticating) {
    return (
      <Shell>
        <AppSplash />
      </Shell>
    );
  }

  return (
    <Shell landing={screen === "landing"} main={showNav}>
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
                console.warn("[Onboarding] Immediate snippet upload failed, will sync later:", err);
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

      {screen === "pressure" && (
        <PressureChat
          isOnboarding={true}
          onDone={async (style, rt, isHesitated, scenarioId) => {
            try {
              setAttachmentStyle(style);
              setAvgResponseTime(rt);
              setHesitated(isHesitated);

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
                attachmentStyle: style,
                avgResponseTime: rt,
                topPriority: topPriority || "rodina",
                hesitated: isHesitated,
                completedPressureScenarios: [scenarioId],
              };
              setProfile(updated);

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
                      console.error(`[Onboarding] Failed to upload snippet ${idx + 1}:`, fetchErr);
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
                  setProfile(updated);
                }

                // Backend Sync: Save Profile
                await saveUserProfile(targetUserId, updated, publicVideoUrls);
              } else {
                console.warn("[Demo Mode] Skipping backend upload because user is not signed in.");
              }

              // Generate mock legacy answers for the orb seed
              const derivedAnswers: FullAnswers = {
                q1: rt < 2.5 ? "A" : "B",
                q2: (cognitiveDepth || 0.5) > 0.6 ? "A" : "B",
                q3: topPriority === "stabilita" ? "A" : "B",
                q4: topPriority === "rodina" ? "A" : "B",
                q5: (cognitiveDepth || 0.5) > 0.8 ? "A" : "B",
                q6: (conscientiousness || 0.5) > 0.6 ? "A" : "B",
              };
              setAnswers(derivedAnswers);
              setScreen("processing");
            } catch (err: any) {
              console.error("[UPLOAD_FAILED]: CONNECTION_SEVERED", err);
              alert(
                `Výsledky sa nepodarilo uložiť. Skús znova.`,
              );
            }
          }}
        />
      )}

      {screen === "processing" && (
        <Processing
          seed={orbSeedFor(userAnswers)}
          archetype={archetypeOf(userAnswers)}
          onDone={() => {
            setScreen("noOne");
          }}
        />
      )}
      {screen === "autoMatch" && (
        <div className="animate-kinetic-fade">
          <AutoMatch
            nextName={pickNextMatch()?.name ?? null}
            hasNext={pickNextMatch() !== null}
            isInitiated={pickNextMatch() ? initiatedMatchIds.has(pickNextMatch()!.id) : false}
            onReady={() => goToNextMatch()}
          />
        </div>
      )}
      {screen === "chamber" && activeMatch && profile && (
        <Chamber
          user={profile}
          match={activeMatch}
          myVideoUrl={livenessVideoUrl ?? undefined}
          onSuccess={(blurLevel) => onChamberSuccess(activeMatch, blurLevel)}
          onDiscard={() => onChamberDiscard(activeMatch.id)}
          onFairInteraction={reduceRedemptionQuota}
        />
      )}
      {screen === "noOne" && profile && (
        <div className="animate-kinetic-fade">
          <Dashboard
            profile={profile}
            matches={rankedMatches}
            sortBy={sortBy}
            onSortChange={setSortBy}
            onSelectMatch={(id) => {
              setActiveMatchId(id);
              setScreen("chamber");
            }}
            onMessages={() => setScreen("messages")}
            hasMessages={conversations.length > 0}
            initiatedMatchIds={initiatedMatchIds}
          />
        </div>
      )}
      {screen === "messages" && (
        <div className="animate-kinetic-fade">
          <MessagesList
            conversations={conversations}
            matches={liveCandidates}
            onOpen={(id) => {
              haptic("tap");
              setActiveConversationId(id);
              setConversations((cs) => cs.map((c) => (c.id === id ? { ...c, unread: false } : c)));
              setScreen("thread");
            }}
            onFindNew={() => {
              haptic("tap");
              goToNextMatch();
            }}
          />
        </div>
      )}
      {screen === "thread" && activeConversation && activeConversationMatch && profile && (
        <MessageThread
          conversation={activeConversation}
          match={activeConversationMatch}
          myVideoUrl={livenessVideoUrl ?? undefined}
          user={profile}
          onUpdateUser={(update) => setProfile((prev) => (prev ? { ...prev, ...update } : null))}
          onBack={() => setScreen("messages")}
          onEnd={() => endConversation(activeConversation.id)}
          onUpdate={(patch) => updateConversation(activeConversation.id, patch)}
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
            onBack={() => setScreen("autoMatch")}
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
          onTest={goTest}
          onMessages={goMessages}
          onSettings={goSettings}
          onProfile={goProfile}
        />
      )}
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
  onTest,
  onMessages,
  onSettings,
  onProfile,
}: {
  active: "home" | "test" | "messages" | "settings" | "profile";
  unread: number;
  testDone: boolean;
  onHome: () => void;
  onTest: () => void;
  onMessages: () => void;
  onSettings: () => void;
  onProfile: () => void;
}) {
  const isInputActive = useIsKeyboardOrInputActive();

  const Item = ({
    id,
    icon,
    label,
    onClick,
    badge,
  }: {
    id: string;
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    badge?: number;
  }) => {
    const is = id === active;
    return (
      <button
        onClick={onClick}
        aria-current={is ? "page" : undefined}
        className="app-nav-item"
      >
        <span className="relative flex items-center justify-center size-7">
          {icon}
          {!!badge && badge > 0 && (
            <span className={`absolute -top-1 -right-2 grid min-w-5 place-items-center rounded-full px-1 text-xs font-bold ${is ? "bg-background text-foreground" : "bg-foreground text-background"}`}>
              {badge}
            </span>
          )}
        </span>
        <span
          className="text-xs font-semibold leading-none"
        >
          <span>{label}</span>
        </span>
      </button>
    );
  };
  return (
    <nav
      aria-label="Hlavná navigácia"
      className={`fixed inset-x-0 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-40 px-4 flex justify-center pointer-events-none select-none transition-all duration-300 ${
        isInputActive ? "opacity-0 translate-y-16 pointer-events-none" : "opacity-100 translate-y-0"
      }`}
    >
      <div className="app-nav pointer-events-auto flex w-full max-w-md items-stretch">
        <Item
          id="home"
          icon={<Home className="size-5" />}
          label={testDone ? "Spojenia" : "Domov"}
          onClick={onHome}
        />
        <Item
          id="messages"
          icon={<MessageCircle className="size-5" />}
          label="Správy"
          onClick={onMessages}
          badge={unread}
        />

        {testDone && (
          <>
            <Item
              id="profile"
              icon={<User className="size-5" />}
              label="Profil"
              onClick={onProfile}
            />
            <Item
              id="settings"
              icon={<SettingsIcon className="size-5" />}
              label="Nastavenia"
              onClick={onSettings}
            />
          </>
        )}
        {!testDone && (
          <>
            <Item
              id="settings"
              icon={<SettingsIcon className="size-5" />}
              label="Nastavenia"
              onClick={onSettings}
            />
          </>
        )}
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
      className={`cta-gradient cta-gradient-hover py-4 text-xs tracking-widest uppercase font-mono font-bold active:scale-[0.97] hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed ${className ?? ""}`}
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

  const choose = (nextChoice: "travel" | "love") => {
    haptic("medium");
    setChoice(nextChoice);
  };

  return (
    <div className="flex min-h-full flex-col px-1">
      <header className="flex items-center justify-between">
        <AntidoteLogo markClassName="h-9" />
        <span className="font-mono text-xs text-foreground/35">01</span>
      </header>

      <main className="landing-main my-auto">
        <div className="landing-question max-w-sm">
          <h1 className="landing-title font-display font-extrabold leading-[0.96] tracking-[-0.055em] text-foreground">
            Čo by si radšej stratil/a na jeden rok?
          </h1>
        </div>

        <div className="landing-options grid gap-3">
          <button
            type="button"
            onClick={() => choose("travel")}
            aria-pressed={choice === "travel"}
            className={`tactile-button landing-option flex items-center justify-between gap-2 text-left ${
              choice === "travel" ? "bg-cerebral text-background" : "bg-card text-foreground"
            }`}
          >
            <span className="font-display text-xl font-bold leading-tight">Možnosť cestovať</span>
            <span className="font-mono text-sm">A</span>
          </button>
          <button
            type="button"
            onClick={() => choose("love")}
            aria-pressed={choice === "love"}
            className={`tactile-button landing-option flex items-center justify-between gap-2 text-left ${
              choice === "love" ? "bg-accent text-accent-foreground" : "bg-card text-foreground"
            }`}
          >
            <span className="font-display text-xl font-bold leading-tight">
              Možnosť zamilovať sa
            </span>
            <span className="font-mono text-sm">B</span>
          </button>
        </div>

        {choice && (
          <div className="landing-result animate-fade-in border-t border-foreground/30">
            <p className="font-display text-xl font-semibold leading-tight tracking-[-0.035em]">
              Toto nebola náhodná otázka.
            </p>
            <p className="mt-1 text-sm leading-snug text-foreground/60">
              Antidote spája ľudí podľa spôsobu rozhodovania, nie podľa prvého dojmu.
            </p>
            <div className="landing-sign-in">
              <GoogleSignInButton onSuccess={onGoogle} />
            </div>
          </div>
        )}
      </main>
    </div>
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
    <div className="flex min-h-[80vh] flex-col items-center justify-center text-center animate-fade-up">
      <div className="border border-foreground/20 p-6 max-w-sm w-full bg-card flex flex-col items-center">
        <p className="mb-3 text-xs font-medium text-foreground/65">Overenie profilu</p>
        <h2 className="font-display text-2xl font-bold tracking-tight text-foreground mb-2">
          Najprv krátke overenie
        </h2>
        <p className="text-sm text-foreground/75 leading-relaxed mb-4">
          Kameru použijeme na krátke video a overenie, že si skutočná osoba. Po spustení ťa prehliadač požiada o prístup ku kamere.
        </p>

        <div className="relative my-4 grid place-items-center">
          <div className="relative w-48 aspect-[3/4] overflow-hidden border border-foreground/25 bg-black">
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
                <div className="absolute inset-x-1 bottom-1.5 bg-black/85 border border-foreground/15 px-1.5 py-1 text-center text-xs font-mono leading-tight">
                  <div className="mb-0.5 font-semibold text-white">
                    Pohyb hlavy
                  </div>
                  <div className="flex flex-col gap-0.5 text-left text-white">
                    <div
                      className={
                        challengeStep === "center"
                          ? "text-green-400 font-bold"
                          : "text-white/75"
                      }
                    >
                      {challengeStep === "center" ? "● " : "○ "}1. Pozri do kamery
                    </div>
                    <div
                      className={
                        challengeStep === "turn_right"
                          ? "text-green-400 font-bold"
                          : "text-white/75"
                      }
                    >
                      {challengeStep === "turn_right" ? "● " : "○ "}2. Otoč hlavu doprava
                    </div>
                    <div
                      className={
                        challengeStep === "turn_left"
                          ? "text-green-400 font-bold"
                          : "text-white/75"
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
                    <span className="text-xs tracking-wider text-foreground/80 font-mono uppercase">
                      Pripravujem overenie…
                    </span>
                  </div>
                ) : (
                  <User className="size-12 animate-pulse" />
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
                <span className="font-mono text-3xl text-foreground font-black">{countdown}</span>
              </div>
            )}
            {phase === "recording" && challengeStep === "done" && (
              <div className="absolute inset-x-0 top-3 mx-auto w-fit bg-red-600 px-2 py-0.5 font-mono text-xs tracking-widest text-white uppercase font-bold">
                Nahráva sa
              </div>
            )}
            {phase === "verifying" && (
              <div className="absolute inset-0 bg-foreground/10 pointer-events-none grid place-items-center">
                <span className="text-xs font-mono tracking-widest text-foreground animate-pulse font-bold">
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

        {phase === "error" && <p className="text-xs text-red-500 mb-4 leading-relaxed">{errMsg}</p>}

        <div className="w-full space-y-2">
          {(phase === "idle" || phase === "error") && (
            <button
              disabled={modelLoading}
              onClick={() => {
                if (phase === "error") retake();
                else runScan();
              }}
              className="w-full bg-foreground text-background font-mono font-bold text-sm tracking-widest uppercase py-4 hover:bg-foreground/90 disabled:opacity-20 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Camera className="size-4" />
              {modelLoading ? "Pripravujem overenie…" : phase === "error" ? "Skúsiť znova" : "Spustiť overenie"}
            </button>
          )}
          {phase === "ready" && (
            <>
              <button
                onClick={() => onDone(recordedUrl)}
                className="w-full bg-foreground text-background font-mono font-bold text-sm tracking-widest uppercase py-4 hover:bg-foreground/90 transition-all cursor-pointer"
              >
                POKRAČOVAŤ
              </button>
              <button
                onClick={retake}
                className="w-full border border-foreground/20 py-3 text-sm tracking-widest text-foreground/60 hover:bg-foreground/5 font-bold font-mono uppercase cursor-pointer"
              >
                ZRUŠIŤ
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Briefing({ onBegin }: { onBegin: () => void }) {
  return (
    <div className="flex min-h-[80vh] flex-col px-1 py-3 animate-fade-up">
      <header className="flex items-center justify-between"><Logo /><span className="font-mono text-xs text-foreground/35">02</span></header>
      <main className="my-auto py-10">
        <p className="editorial-kicker text-foreground/50">Otázky · približne 2 minúty</p>
        <h1 className="mt-5 max-w-sm font-display text-[clamp(2.35rem,10vw,4.6rem)] font-extrabold leading-[0.96] tracking-[-0.055em]">
          Poďme sa trochu spoznať.
        </h1>
        <div className="mt-8 border-t border-foreground/30 pt-6">
        <p className="max-w-sm text-base leading-relaxed text-foreground/70">
          Čakajú ťa otázky o vzťahoch, hodnotách a o tom, ako sa rozhoduješ.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-foreground/50">
          Odpovedaj tak, ako to cítiš. Neexistujú správne odpovede.
        </p>
        <button
          type="button"
          onClick={onBegin}
          className="tactile-button mt-8 flex min-h-20 w-full items-center justify-between bg-foreground p-5 text-left text-background"
        >
          <span className="font-display text-xl font-bold">Začať</span>
          <ChevronRight className="size-5" aria-hidden="true" />
        </button>
        </div>
      </main>
    </div>
  );
}

interface MatchCardProps {
  match: RankedMatch;
  profile: UserProfile;
  similarityPct: number;
  extLabel: string;
  attachmentLabel: string;
  initiatedMatchIds?: Set<string>;
  onSelectMatch: (id: string) => void;
}

function MatchCard({
  match,
  profile,
  similarityPct,
  extLabel,
  attachmentLabel,
  initiatedMatchIds,
  onSelectMatch,
}: MatchCardProps) {
  const haptic = useHaptic();
  const sharedPriority =
    profile.topPriority && match.top_priority && profile.topPriority === match.top_priority;

  return (
    <article className="match-card">
      <div className="match-card-header">
        <div>
          <h3 className="match-card-name">
            {match.name}
            <span className="ml-2 text-base font-medium text-foreground/50">{match.age}</span>
          </h3>
          <p className="mt-2 text-sm text-foreground/70">
            {match.city}
            {match.distanceKm !== undefined && ` · ${Math.round(match.distanceKm)} km`}
          </p>
        </div>
        <div className="match-card-video">
          {match.videoUrls && match.videoUrls.length > 0 ? (
            <video
              src={match.videoUrls[0]}
              autoPlay
              loop
              muted
              playsInline
              className="size-full object-cover bg-black blur-[6px] scale-110"
              style={{ transform: "scaleX(-1)" }}
            />
          ) : (
            <img
              src={match.img}
              alt={match.name}
              className="size-full object-cover blur-md scale-125"
            />
          )}
        </div>
      </div>

      <div className="match-card-story">
        <p className="match-card-highlight">
          {sharedPriority
            ? `Obaja dávate na prvé miesto hodnotu „${profile.topPriority}“.`
            : `Vaše odpovede sa podobajú na ${similarityPct} %.`}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-foreground/60">{match.bio}</p>
      </div>

      <div className="match-card-facts">
        <div>
          <p className="text-xs font-medium text-foreground/65">Podobnosť odpovedí</p>
          <p className="mt-2 font-display text-lg font-bold">{similarityPct} %</p>
        </div>
        <div>
          <p className="text-xs font-medium text-foreground/65">Povaha spojenia</p>
          <p className="mt-2 text-sm font-semibold leading-snug">{extLabel}</p>
          <p className="mt-1 text-xs text-foreground/50">
            {attachmentLabel}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          haptic("medium");
          onSelectMatch(match.id);
        }}
        className="match-card-action"
      >
        <span className="font-display text-base font-bold">
          {initiatedMatchIds?.has(match.id) ? "Pokračovať v rozhovore" : "Odpovedať hlasom"}
        </span>
        <Mic className="size-5" />
      </button>
    </article>
  );
}

function Dashboard({
  profile,
  matches,
  sortBy,
  onSortChange,
  onSelectMatch,
  onMessages,
  hasMessages,
  initiatedMatchIds,
}: {
  profile: UserProfile;
  matches: RankedMatch[];
  sortBy: "ev" | "distance";
  onSortChange: (sort: "ev" | "distance") => void;
  onSelectMatch: (matchId: string) => void;
  onMessages: () => void;
  hasMessages: boolean;
  initiatedMatchIds?: Set<string>;
}) {
  const haptic = useHaptic();

  // Filter matches that are active/available
  const availableMatches = matches.slice(0, 3); // limit to 3 curated daily matches

  return (
    <div className="personal-screen">
      <header className="personal-header">
        <p className="personal-eyebrow">Antidote / Spojenia</p>
        <h1 className="personal-title">Dnešné spojenia</h1>
        <p className="personal-intro">Ľudia, ktorých môžeš dnes spoznať</p>
      </header>

      {profile.redemptionQuota && profile.redemptionQuota > 0 ? (
        <div className="mt-3 border-l-2 border-destructive bg-destructive/5 px-3 py-2">
          <div className="mb-1 flex items-center gap-2 font-semibold text-destructive">
            <AlertTriangle className="size-4 shrink-0" />
            <span>Dočasne nižšie skóre dôvery</span>
          </div>
          <p className="text-sm leading-relaxed text-foreground/80">
            Skóre kleslo po predčasnom odchode z rozhovoru. Obnoví sa, keď dokončíš potrebný počet rozhovorov.
          </p>
          <div className="mt-2 flex items-center justify-between border-t border-destructive/20 pt-2 font-medium">
            <span>Zostáva dokončiť:</span>
            <span className="font-bold text-destructive">
              {profile.redemptionQuota} / 3
            </span>
          </div>
        </div>
      ) : null}

      <div className="personal-setting my-3">
        <span className="font-medium">Zoradiť podľa</span>
        <div className="personal-segments" role="group" aria-label="Zoradiť podľa">
          {([{ value: "ev", label: "Zhody" }, { value: "distance", label: "Vzdialenosti" }] as const).map(({ value, label }) => (
            <button key={value} type="button" aria-pressed={sortBy === value} className="personal-segment" onClick={() => { haptic("tap"); onSortChange(value); }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {availableMatches.length === 0 ? (
        <div className="personal-section space-y-2">
          <Brain className="size-6 text-muted-foreground" />
          <h2 className="personal-heading">
            Žiadne nové spojenia
          </h2>
          <p className="leading-relaxed text-muted-foreground">
            Skús to neskôr alebo v profile zväčši vzdialenosť vyhľadávania.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {availableMatches.map((match) => {
            const similarityPct = Math.round(
              (1.0 -
                Math.sqrt(
                  Math.pow((profile.cognitiveDepth ?? 0.5) - match.cognitive_depth, 2) +
                    Math.pow((profile.conscientiousness ?? 0.5) - match.conscientiousness, 2),
                ) /
                  Math.sqrt(2.0)) *
                100,
            );

            const extSum = (profile.extraversion ?? 0.5) + match.extraversion;
            let extLabel = "Vyvážená energia";
            if (extSum < 0.6) extLabel = "Introvertný súlad";
            else if (extSum > 1.4) extLabel = "Extrovertný súlad";

            const isSecureMatch =
              profile.attachmentStyle === "Secure" && match.attachment_style === "Secure";
            const attachmentLabel = isSecureMatch ? "Bezpečný štýl väzby" : "Bežný štýl väzby";

            return (
              <MatchCard
                key={match.id}
                match={match}
                profile={profile}
                similarityPct={similarityPct}
                extLabel={extLabel}
                attachmentLabel={attachmentLabel}
                initiatedMatchIds={initiatedMatchIds}
                onSelectMatch={onSelectMatch}
              />
            );
          })}
        </div>
      )}

      {hasMessages && (
        <button
          type="button"
          onClick={onMessages}
          className="mt-6 w-full border border-cerebral/30 bg-cerebral/5 py-4 text-sm tracking-widest text-foreground hover:bg-cerebral hover:text-background transition-all uppercase font-mono cursor-pointer"
        >
          Zobraziť uložené konverzácie
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
          <p className="mt-1 font-display text-2xl font-bold tracking-[-0.05em]">
            {String(idx + 1).padStart(2, "0")} <span className="text-foreground/30">/ 06</span>
          </p>
        </div>
        <div className="text-right">
          <span className="editorial-kicker text-foreground/45">
            {phase === "read" ? "Najprv iba čítaj" : "Teraz sa rozhodni"}
          </span>
          <p className={`mt-1 font-mono text-sm font-semibold ${danger ? "text-cerebral" : ""}`}>
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
        <p className="font-display text-[clamp(1.8rem,8vw,2.8rem)] font-bold leading-[1.02] tracking-[-0.055em] text-foreground">
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
                <span className="shrink-0 font-mono text-sm">{k.toUpperCase()}</span>
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
    <div className="flex min-h-[72vh] flex-col justify-center px-1 sm:min-h-[80vh]">
      <p className="editorial-kicker text-cerebral">Tvoj profil je hotový</p>
      <h2 className="mt-4 max-w-lg font-display text-5xl font-extrabold leading-[0.92] tracking-[-0.065em] sm:text-6xl">
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
      <p className="mt-4 text-sm text-foreground/50">
        Hľadáme spojenia podľa tvojich odpovedí.
      </p>
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

  const stepNumber = { SYSTEM_IDENTIFICATION: 1, TEMPORAL_MATRIX: 2, AGE_VERIFICATION: 3, MARKET_ALIGNMENT: 4 }[step];

  return (
    <div
      className={`personal-screen transition-colors duration-100 ${
        errorFlash ? "bg-red-500/5" : ""
      }`}
    >
      <p className="personal-eyebrow mb-3" role="status">Krok {stepNumber} zo 4</p>

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
          className="w-full border-t-2 border-foreground pt-4"
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
            <div role="alert" className="mt-3 border-l-2 border-destructive bg-destructive/10 p-3 font-medium text-destructive">
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
          className="w-full border-t-2 border-foreground pt-4"
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
            <div role="alert" className="mt-3 border-l-2 border-destructive bg-destructive/10 p-3 font-medium text-destructive">
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
          className="w-full border-t-2 border-foreground pt-4"
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
            <div role="alert" className="mt-3 border-l-2 border-destructive bg-destructive/10 p-3 font-medium text-destructive">
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
          className="w-full border-t-2 border-foreground pt-4"
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
            <div role="alert" className="mt-3 border-l-2 border-destructive bg-destructive/10 p-3 font-medium text-destructive">
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

// ============ AutoMatch (algoritmus vyberá) ============
function AutoMatch({
  nextName,
  hasNext,
  isInitiated,
  onReady,
}: {
  nextName: string | null;
  hasNext: boolean;
  isInitiated: boolean;
  onReady: () => void;
}) {
  const haptic = useHaptic();
  useEffect(() => {
    haptic("phase");
    const t = setTimeout(onReady, 2400);
    return () => clearTimeout(t);
  }, [onReady, haptic]);
  return (
    <div className="flex min-h-[70vh] flex-col justify-center animate-fade-up">
      <p className="editorial-kicker text-cerebral">Hlasové spojenie</p>
      <h2 className="mt-4 font-display text-5xl font-extrabold leading-[0.92] tracking-[-0.065em]">
        Pripravujeme rozhovor
      </h2>
      <div className="my-10 flex h-24 items-end gap-2" aria-hidden>
        {[42, 78, 56, 92, 65, 35, 74, 48, 84, 58, 30, 68].map((height, index) => (
          <span
            key={index}
            className="flex-1 animate-pulse bg-accent"
            style={{ height: `${height}%`, animationDelay: `${index * 70}ms` }}
          />
        ))}
      </div>
      <p className="border-t border-foreground/30 pt-5 text-base text-foreground/65">
        {hasNext
          ? isInitiated
            ? `Vraciame ťa do rozhovoru s ${nextName ?? "tvojím partnerom"}.`
            : `Pripájame ťa k hlasovému rozhovoru s ${nextName ?? "novým človekom"}.`
          : "Dnes tu zatiaľ nie je nové spojenie."}
      </p>
    </div>
  );
}

// ============ NoOne ============
function NoOne({ onMessages }: { onMessages: (() => void) | null }) {
  return (
    <div className="flex min-h-[80vh] flex-col px-1 py-3 animate-fade-up">
      <header><Logo /></header>
      <main className="my-auto py-10">
        <p className="editorial-kicker text-foreground/50">Tvoje spojenia</p>
        <h1 className="mt-5 max-w-sm font-display text-[clamp(2.35rem,10vw,4.6rem)] font-extrabold leading-[0.96] tracking-[-0.055em]">
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
  onOpen,
  onFindNew,
}: {
  conversations: Conversation[];
  matches: RankedMatch[];
  onOpen: (id: string) => void;
  onFindNew: () => void;
}) {
  return (
    <div className="personal-screen">
      <header className="personal-header">
        <p className="personal-eyebrow">Antidote</p>
        <h1 className="personal-title">Správy</h1>
      </header>

      {conversations.length === 0 ? (
        <div className="personal-section">
          <MessageCircle className="size-7 text-cerebral" aria-hidden="true" />
          <h2 className="personal-heading mt-2">Zatiaľ žiadne správy</h2>
          <p className="personal-intro">
            Keď sa obaja rozhodnete pokračovať, váš rozhovor nájdeš tu.
          </p>
        </div>
      ) : (
        <div className="grid">
          {conversations.map((c) => {
            const m = matches.find((x) => x.id === c.matchId);
            if (!m) return null;
            const last = c.messages[c.messages.length - 1];
            const blurPx = Math.round((c.blurLevel / 100) * BLUR_START);
            return (
              <button
                key={c.id}
                onClick={() => onOpen(c.id)}
                className="personal-link group gap-3 py-2.5"
              >
                <div className="relative size-12 shrink-0 overflow-hidden">
                  <img
                    src={m.img}
                    alt={m.name}
                    className="size-full object-cover"
                    style={{
                      filter: `blur(${blurPx}px) saturate(0.9)`,
                      transform: "scale(1.15)",
                      transition: "filter 500ms ease",
                    }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3
                      className={`truncate text-base ${c.unread ? "font-bold" : "font-medium"}`}
                    >
                      {m.name}
                    </h3>
                    <span className="shrink-0 text-sm text-muted-foreground">{m.age}</span>
                    <span className="truncate text-sm text-muted-foreground">· {m.city}</span>
                    {c.unread && (
                      <span className="size-2 rounded-full bg-cerebral shadow-[0_0_6px_var(--cerebral)] animate-pulse" />
                    )}
                  </div>
                  <p className="mt-1 flex items-center gap-2 text-sm text-foreground/70">
                    {last?.media?.kind === "audio" && <span aria-hidden="true" className="text-cerebral">▂▅▃▆▂</span>}
                    <span className="truncate">{last
                      ? (last.from === "me" ? "Ty: " : "") + (last.text || (last.media?.kind === "audio" ? "Hlasová správa" : "Médiá"))
                      : "Napíš prvú správu."}</span>
                  </p>
                </div>
                <ChevronRight className="size-5 shrink-0 text-foreground/30 group-hover:text-foreground" />
              </button>
            );
          })}
        </div>
      )}

      <button
        onClick={onFindNew}
        className="personal-action mt-4 w-full"
      >
        Nájsť spojenie
      </button>
    </div>
  );
}

// ============ Message thread (1-na-1 textový chat) ============
const THREAD_BLUR_STEP = 8; // 100 → 0 v ~13 vlastných správach

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
