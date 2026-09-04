import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "BikeApp",
  slug: "BIKEAPP",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "bikeapp",
  userInterfaceStyle: "dark",
  ios: {
    bundleIdentifier: "com.bikeapp.placeholder",
    icon: "./assets/expo.icon",
    supportsTablet: false,
    infoPlist: {
      UIBackgroundModes: ["location"],
    },
  },
  android: {
    package: "com.bikeapp.placeholder",
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
    [
      "expo-splash-screen",
      {
        backgroundColor: "#0B0B0D",
        image: "./assets/images/splash-icon.png",
        imageWidth: 76,
      },
    ],
    "expo-sqlite",
    "expo-secure-store",
    [
      "expo-location",
      {
        locationWhenInUsePermission:
          "BikeApp uses your location to record your ride's route, distance, and speed while the app is open.",
        locationAlwaysAndWhenInUsePermission:
          "BikeApp needs background location access to keep recording your ride's route, distance, and speed even when your phone is locked or the app is in the background.",
        isAndroidBackgroundLocationEnabled: true,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
};

export default config;
