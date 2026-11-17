import React, { useState, useEffect, useRef } from "react";
import {
  Settings as SettingsIcon,
  ShieldAlert,
  ShieldCheck,
  Shield,
  Key,
  LogOut,
  Trash2,
  Camera,
  Mic,
  Compass,
  AlertTriangle,
  Snowflake,
  Loader2,
  Bell,
  Sun,
  Moon,
  Monitor,
  ChevronRight,
} from "lucide-react";
import { UserProfile, ThemeMode } from "@/lib/resonance";
import { useHaptic } from "@/hooks/use-haptics";
import { supabase } from "@/lib/supabase";
import { BackgroundGeoEngine } from "@/lib/geo";

interface SystemConfigProps {
  user: UserProfile;
  onUpdateUser: React.Dispatch<React.SetStateAction<UserProfile | null>>;
  theme: ThemeMode;
  onTheme: (m: ThemeMode) => void;
  onOpenTerms: () => void;
  onOpenPrivacy: () => void;
  onOpenCookies: () => void;
  onOpenContact: () => void;
}

export function SystemConfig({
  user,
  onUpdateUser,
  theme,
  onTheme,
  onOpenTerms,
  onOpenPrivacy,
  onOpenCookies,
  onOpenContact,
}: SystemConfigProps) {
  const haptic = useHaptic();

  // Hardware permissions states
  const [micPermission, setMicPermission] = useState<"granted" | "denied" | "prompt">("prompt");
  const [camPermission, setCamPermission] = useState<"granted" | "denied" | "prompt">("prompt");
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lon: number } | null>(
    user.coords ?? null,
  );
  const [isGpsLoading, setIsGpsLoading] = useState(false);

  // Alerts states

  // Market freeze state
  const [isFrozen, setIsFrozen] = useState(user.status === "FROZEN");

  // Local personalization states
  const [hapticProfile, setHapticProfile] = useState<"STEALTH" | "TACTILE" | "MECHANICAL">(
    user.haptic_profile || (localStorage.getItem("reson_haptic_profile") as any) || "TACTILE"
  );
  const [geoDensity, setGeoDensity] = useState<"ECO_5KM" | "BALANCED_2KM" | "HIGH_FREQ_500M">(
    user.geo_density || (localStorage.getItem("reson_geo_density") as any) || "BALANCED_2KM"
  );
  const [uiSpeed, setUiSpeed] = useState<"TYPEWRITER_ANIMATED" | "INSTANT_RAW">(
    user.ui_speed || (localStorage.getItem("reson_ui_speed") as any) || "TYPEWRITER_ANIMATED"
  );

  // Confirmation states to avoid native blocking alerts/confirms (which Capacitor can ignore)
  const [showWipeConfirm, setShowWipeConfirm] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [freezeMessage, setFreezeMessage] = useState<string | null>(null);

  // Sync initial database settings to state and local storage on mount/update
  useEffect(() => {
    if (user.haptic_profile) {
      setHapticProfile(user.haptic_profile);
      localStorage.setItem("reson_haptic_profile", user.haptic_profile);
    }
    if (user.geo_density) {
      setGeoDensity(user.geo_density);
      localStorage.setItem("reson_geo_density", user.geo_density);
      BackgroundGeoEngine.setDistanceFilter(user.geo_density);
    }
    if (user.ui_speed) {
      setUiSpeed(user.ui_speed);
      localStorage.setItem("reson_ui_speed", user.ui_speed);
    }
  }, [user.haptic_profile, user.geo_density, user.ui_speed]);

  async function handleUpdateHapticProfile(val: "STEALTH" | "TACTILE" | "MECHANICAL") {
    setHapticProfile(val);
    localStorage.setItem("reson_haptic_profile", val);
    haptic("tap");

    if (user.id && user.id !== "00000000-0000-0000-0000-000000000001") {
      const { error } = await supabase
        .from("profiles")
        .update({ haptic_profile: val })
        .eq("id", user.id);
      if (error) {
        console.error("[settings] failed to save haptic profile in database:", error);
      }
    }
    onUpdateUser((prev) => (prev ? { ...prev, haptic_profile: val } : null));
  }

  async function handleUpdateGeoDensity(val: "ECO_5KM" | "BALANCED_2KM" | "HIGH_FREQ_500M") {
    setGeoDensity(val);
    localStorage.setItem("reson_geo_density", val);
    BackgroundGeoEngine.setDistanceFilter(val);
    haptic("tap");

    if (user.id && user.id !== "00000000-0000-0000-0000-000000000001") {
      const { error } = await supabase
        .from("profiles")
        .update({ geo_density: val })
        .eq("id", user.id);
      if (error) {
        console.error("[settings] failed to save geo density in database:", error);
      }
    }
    onUpdateUser((prev) => (prev ? { ...prev, geo_density: val } : null));
  }

  async function handleUpdateUiSpeed(val: "TYPEWRITER_ANIMATED" | "INSTANT_RAW") {
    setUiSpeed(val);
    localStorage.setItem("reson_ui_speed", val);
    haptic("tap");

    if (user.id && user.id !== "00000000-0000-0000-0000-000000000001") {
      const { error } = await supabase
        .from("profiles")
        .update({ ui_speed: val })
        .eq("id", user.id);
      if (error) {
        console.error("[settings] failed to save UI speed in database:", error);
      }
    }
    onUpdateUser((prev) => (prev ? { ...prev, ui_speed: val } : null));
  }

  // Fetch permissions status on mount
  useEffect(() => {
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions
        .query({ name: "microphone" as any })
        .then((result) => {
          setMicPermission(result.state);
          result.onchange = () => setMicPermission(result.state);
        })
        .catch(() => {});

      navigator.permissions
        .query({ name: "camera" as any })
        .then((result) => {
          setCamPermission(result.state);
          result.onchange = () => setCamPermission(result.state);
        })
        .catch(() => {});
    }
  }, []);

  function saveFilterChange(key: string, value: any) {
    onUpdateUser((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        [key]: value,
      };
    });
  }

  // Refresh Geolocation coordinates
  function handleRefreshCoordinates() {
    haptic("tap");
    setIsGpsLoading(true);

    if (!navigator.geolocation) {
      alert("Geolokácia nie je podporovaná týmto prehliadačom.");
      setIsGpsLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const newCoords = { lat: latitude, lon: longitude };
        setGpsCoords(newCoords);
        saveFilterChange("coords", newCoords);
        setIsGpsLoading(false);
        haptic("success");
        alert(
          `Súradnice aktualizované: [Lat: ${latitude.toFixed(4)}, Lon: ${longitude.toFixed(4)}]`,
        );
      },
      (err) => {
        console.error("[config] GPS refresh error:", err);
        alert("Chyba geolokácie: Uistite sa, že máte zapnuté GPS a povolené vyhľadávanie.");
        setIsGpsLoading(false);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000,
      },
    );
  }

  // Market Freeze Toggle (hides profile without EV penalty)
  async function handleToggleFreeze() {
    haptic("warning");
    const nextState = !isFrozen;
    setIsFrozen(nextState);

    if (user.id && user.id !== "00000000-0000-0000-0000-000000000001") {
      const { error } = await supabase
        .from("profiles")
        .update({ status: nextState ? "FROZEN" : "ACTIVE" })
        .eq("id", user.id);

      if (error) {
        console.error("[settings] failed to toggle freeze in database:", error);
        setFreezeMessage("Chyba: Nepodarilo sa zmeniť stav profilu v databáze.");
        setIsFrozen(!nextState); // rollback
        return;
      }
    }

    onUpdateUser((prev) => (prev ? { ...prev, status: nextState ? "FROZEN" : "ACTIVE" } : null));

    setFreezeMessage(
      nextState
        ? "SKRYTIE PROFILU AKTÍVNE: Váš profil je dočasne skrytý pred ostatnými."
        : "PROFIL JE AKTÍVNY: Váš profil je znova viditeľný pre ostatných."
    );
    setTimeout(() => {
      setFreezeMessage(null);
    }, 4000);
  }

  // Account Management
  async function executeLogout() {
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
    await supabase.auth.signOut();
    location.reload();
  }

  async function executeDataWipe() {
    if (user.id && user.id !== "00000000-0000-0000-0000-000000000001") {
      const { error } = await supabase.rpc("delete_own_user");

      if (error) {
        console.error("[settings] failed to delete account from database:", error);
        setFreezeMessage("Chyba: Nepodarilo sa zmazať účet z databázy. Detail: " + (error.message || JSON.stringify(error)));
        setShowWipeConfirm(false);
        return;
      }
    }

    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
    await supabase.auth.signOut();
    location.reload();
  }

  return (
    <div className="personal-screen animate-fade-up pb-28">
      <header className="mb-7 pt-2">
        <p className="personal-eyebrow">Tvoje miesto v Antidote</p>
        <h1 className="mt-2 font-display text-4xl font-bold tracking-[-0.045em]">Nastavenia</h1>
        <p className="mt-2 text-base leading-relaxed text-foreground/65">Prispôsob si aplikáciu tak, aby ti vyhovovala.</p>
      </header>

      <section className="personal-card mb-4" aria-labelledby="appearance-title">
        <div className="personal-section-heading">
          <span className="personal-icon"><Sun className="size-5" /></span>
          <div><h2 id="appearance-title">Vzhľad</h2><p>Vyber si, v akom svetle chceš Antidote používať.</p></div>
        </div>
        <div className="personal-segments mt-5" aria-label="Vzhľad aplikácie">
          {([
            ["system", "Systém", Monitor],
            ["light", "Svetlý", Sun],
            ["dark", "Tmavý", Moon],
          ] as const).map(([mode, label, Icon]) => (
            <button key={mode} type="button" aria-pressed={theme === mode} onClick={() => { haptic("tap"); onTheme(mode); }} className="personal-segment">
              <Icon className="size-5" aria-hidden="true" /><span>{label}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="personal-card mb-4" aria-labelledby="haptics-title">
        <div className="personal-section-heading">
          <span className="personal-icon"><SettingsIcon className="size-5" /></span>
          <div><h2 id="haptics-title">Odozva na dotyk</h2><p>Zvoľ si intenzitu haptickej odozvy.</p></div>
        </div>
        <div className="personal-segments mt-5" aria-label="Haptická odozva">
          {([
            ["STEALTH", "Vypnutá"], ["TACTILE", "Vyvážená"], ["MECHANICAL", "Výrazná"],
          ] as const).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={hapticProfile === value} onClick={() => handleUpdateHapticProfile(value)} className="personal-segment">{label}</button>
          ))}
        </div>
      </section>

      <section className="personal-card mb-4" aria-labelledby="permissions-title">
        <div className="personal-section-heading mb-4">
          <span className="personal-icon"><ShieldCheck className="size-5" /></span>
          <div><h2 id="permissions-title">Súkromie a povolenia</h2><p>Prehľad prístupu k tvojmu zariadeniu.</p></div>
        </div>
        <div className="personal-row"><span><Mic className="size-5" /> Mikrofón</span><span className="personal-status">{micPermission === "granted" ? "Povolený" : "Nepovolený"}</span></div>
        <div className="personal-row"><span><Camera className="size-5" /> Kamera</span><span className="personal-status">{camPermission === "granted" ? "Povolená" : "Nepovolená"}</span></div>
        <div className="personal-row"><span><Compass className="size-5" /> Poloha</span><span className="personal-status">{gpsCoords ? "Dostupná" : "Nezistená"}</span></div>
        <button type="button" onClick={handleRefreshCoordinates} disabled={isGpsLoading} className="personal-action mt-4 w-full">
          {isGpsLoading ? "Vyhľadávam polohu…" : "Aktualizovať polohu"}
        </button>
      </section>

      <section className="personal-card mb-4" aria-labelledby="alerts-title">
        <div className="personal-section-heading">
          <span className="personal-icon"><Bell className="size-5" /></span>
          <div><h2 id="alerts-title">Upozornenia</h2><p>Dôležité upozornenia na neaktivitu a časový limit v hlasovom chate zostávajú zapnuté.</p></div>
        </div>
      </section>

      <section className="personal-card mb-4" aria-labelledby="documents-title">
        <div className="personal-section-heading mb-3">
          <span className="personal-icon"><Shield className="size-5" /></span>
          <div><h2 id="documents-title">Informácie</h2><p>Všetko dôležité na jednom mieste.</p></div>
        </div>
        {([
          ["Podmienky používania", onOpenTerms], ["Ochrana súkromia", onOpenPrivacy], ["Cookies", onOpenCookies], ["Kontakt", onOpenContact],
        ] as const).map(([label, action]) => (
          <button key={label} type="button" onClick={() => { haptic("tap"); action(); }} className="personal-link"><span>{label}</span><ChevronRight className="size-5" aria-hidden="true" /></button>
        ))}
      </section>

      <section className="personal-card" aria-labelledby="account-title">
        <div className="personal-section-heading mb-3">
          <span className="personal-icon"><Key className="size-5" /></span>
          <div><h2 id="account-title">Účet</h2><p>Spravuj viditeľnosť a svoj účet.</p></div>
        </div>
        {freezeMessage && <p role="status" className="mb-3 text-sm text-foreground/75">{freezeMessage}</p>}
        {showWipeConfirm ? (
          <div className="rounded-2xl bg-red-500/10 p-4">
            <p className="font-semibold text-red-500">Naozaj chceš vymazať účet?</p>
            <p className="mt-2 text-sm leading-relaxed text-foreground/75">Všetky informácie, výsledky testov a správy budú natrvalo vymazané. Táto akcia je nevratná.</p>
            <div className="mt-4 flex gap-2"><button type="button" onClick={executeDataWipe} className="personal-action personal-danger flex-1">Vymazať účet</button><button type="button" onClick={() => { haptic("tap"); setShowWipeConfirm(false); }} className="personal-action flex-1">Zrušiť</button></div>
          </div>
        ) : showLogoutConfirm ? (
          <div className="rounded-2xl bg-foreground/5 p-4">
            <p className="font-semibold">Naozaj sa chceš odhlásiť?</p>
            <div className="mt-4 flex gap-2"><button type="button" onClick={executeLogout} className="personal-action flex-1">Odhlásiť sa</button><button type="button" onClick={() => { haptic("tap"); setShowLogoutConfirm(false); }} className="personal-action flex-1">Zrušiť</button></div>
          </div>
        ) : (
          <>
            <button type="button" onClick={handleToggleFreeze} className="personal-link"><span><Snowflake className="size-5" />{isFrozen ? "Znovu zobraziť profil" : "Skryť profil"}</span><ChevronRight className="size-5" /></button>
            <button type="button" onClick={() => { haptic("warning"); setShowLogoutConfirm(true); }} className="personal-link"><span><LogOut className="size-5" />Odhlásiť sa</span><ChevronRight className="size-5" /></button>
            <button type="button" onClick={() => { haptic("destructive"); setShowWipeConfirm(true); }} className="personal-link text-red-500"><span><Trash2 className="size-5" />Vymazať účet</span><ChevronRight className="size-5" /></button>
          </>
        )}
      </section>
    </div>
  );
}
