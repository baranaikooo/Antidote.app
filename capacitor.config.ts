import { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.antidote.app",
  appName: "Antidote",
  webDir: ".vercel/output/static", // Fallback local directory, but we will use the live server
  overrideUserAgent: "AntidoteMobile",
  plugins: { SystemBars: { hidden: true } },
  server: {
    url: "https://antidotesk.vercel.app/",
    cleartext: true,
  },
};

export default config;
