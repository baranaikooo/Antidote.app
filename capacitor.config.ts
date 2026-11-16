import { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.reson.app",
  appName: "Antidote",
  webDir: ".vercel/output/static", // Fallback local directory, but we will use the live server
  overrideUserAgent: "AntidoteMobile",
  server: {
    url: "https://antidotesk.vercel.app/",
    cleartext: true,
  },
};

export default config;
