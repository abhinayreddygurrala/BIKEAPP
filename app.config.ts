import type { ExpoConfig } from "expo/config";
import { withEntitlementsPlist } from "expo/config-plugins";

import withIosSceneDelegate from "./plugins/withIosSceneDelegate";

const config: ExpoConfig = {
  name: "Odomap",
  slug: "odomap",
  version: "1.0.0",
  orientation: "default",
  icon: "./assets/images/icon.png",
  scheme: "odomap",
  userInterfaceStyle: "automatic",
  ios: {
    // Kept from the app's old name on purpose: changing it makes iOS treat
    // Odomap as a different app (and the Google Maps key is locked to it).
    bundleIdentifier: "com.abhinaygurrala.bikeapp",
    // The Apple Developer Program team (enrolling kept the same team ID).
    appleTeamId: "DWBAYP8K69",
    // Bump for every upload to App Store Connect.
    buildNumber: "4",
    icon: "./assets/expo.icon",
    supportsTablet: false,
    infoPlist: {
      UIBackgroundModes: ["location"],
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: "com.abhinaygurrala.odomap",
    adaptiveIcon: {
      backgroundColor: "#0B0B0D",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    // Google Maps for every map in the app. The key comes from the
    // gitignored .env (it ends up inside the app, as all Google Maps SDK keys
    // do) and is locked in Google Cloud to this bundle ID and the Maps SDK
    // for iOS only.
    [
      "react-native-maps",
      {
        iosGoogleMapsApiKey: process.env.GOOGLE_MAPS_IOS_API_KEY,
      },
    ],
    [
      "expo-splash-screen",
      {
        backgroundColor: "#0B0B0D",
        image: "./assets/images/splash-icon.png",
        imageWidth: 76,
      },
    ],
    "expo-sqlite",
    // Odomap never uses Face ID (no requireAuthentication), so drop the
    // plugin's vague default Face ID permission message.
    ["expo-secure-store", { faceIDPermission: false }],
    "expo-sharing",
    [
      "expo-location",
      {
        locationWhenInUsePermission:
          "Odomap uses your location to record your ride's route, distance, and speed while the app is open.",
        locationAlwaysAndWhenInUsePermission:
          "Odomap needs background location access to keep recording your ride's route, distance, and speed even when your phone is locked or the app is in the background.",
        locationAlwaysPermission:
          "Odomap needs background location access to keep recording your ride's route, distance, and speed even when your phone is locked or the app is in the background.",
        isAndroidBackgroundLocationEnabled: true,
      },
    ],
    [
      "expo-sensors",
      {
        motionPermission: "Odomap uses motion sensors to measure your bike's lean angle while recording a ride.",
      },
    ],
    [
      "expo-image-picker",
      {
        photosPermission:
          "Odomap uses your photo library to add photos of you, your bikes, and your maintenance receipts.",
        cameraPermission:
          "Odomap uses your camera to take photos of you, your bikes, and your maintenance receipts.",
        // Odomap only picks photos, never video, so it doesn't need the mic.
        microphonePermission: false,
      },
    ],
    [
      "expo-screen-orientation",
      {
        initialOrientation: "ALL",
      },
    ],
    // Deliberately not running expo-notifications' own config plugin: it
    // unconditionally adds the "aps-environment" (Push Notifications)
    // entitlement, which a free/personal Apple ID can't provision — and
    // Odomap only schedules LOCAL notifications, which don't need it. The
    // native module still autolinks and works fully without the plugin.
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
};

// expo-notifications gets baseline iOS config auto-applied by
// @expo/prebuild-config regardless of whether it's listed in `plugins`
// above, which includes the "aps-environment" (Push Notifications)
// entitlement — that requires a paid Apple Developer Program membership to
// provision, and a free/personal Apple ID can't sign it. Odomap only ever
// schedules LOCAL notifications, which don't need this entitlement at all,
// so strip it back out as the last step of the config pipeline.
export default withIosSceneDelegate(
  withEntitlementsPlist(config, (cfg) => {
    delete cfg.modResults["aps-environment"];
    return cfg;
  })
);
