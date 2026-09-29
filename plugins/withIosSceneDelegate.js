const fs = require("fs");
const path = require("path");
const { IOSConfig, withAppDelegate, withInfoPlist, withXcodeProject } = require("expo/config-plugins");

// iOS 27's SDK made UIScene-based app lifecycle mandatory — without a scene
// delegate declared, the app builds and installs fine but crashes instantly
// on every real cold launch (SIGTRAP, "NoSceneLifecycleAdoption"). Expo SDK
// 57 doesn't handle this itself (tracked upstream at expo/expo#50179).
//
// This used to be a hand-patched fix directly in the generated ios/ files,
// which is invisible to git (ios/ is gitignored) and vanished more than once
// across `expo prebuild --clean` runs, each time reproducing an instant
// crash-on-launch that "Build Succeeded" gives no hint of. Encoding it as a
// real config plugin makes it regenerate automatically on every prebuild
// instead of being one lost edit away from silently breaking every launch.
//
// Plain JS, not TS: app.config.ts's loader only transpiles app.config.ts
// itself, not files it locally imports, so a .ts plugin file fails to
// `require()` here.
const SCENE_DELEGATE_SOURCE = `import UIKit

// Minimal UIWindowSceneDelegate — deliberately does not touch React
// Native's own bootstrap. AppDelegate still creates the window and starts
// React Native in didFinishLaunchingWithOptions exactly as before; this
// just hands that already-created window to the connecting UIWindowScene.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
    guard let windowScene = scene as? UIWindowScene else { return }
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else { return }

    if let window = appDelegate.window {
      window.windowScene = windowScene
      self.window = window
      window.makeKeyAndVisible()
    }
  }
}
`;

const APP_DELEGATE_ANCHOR = "return super.application(application, didFinishLaunchingWithOptions: launchOptions)\n  }";

// No `override` here — a clean compile confirmed ExpoAppDelegate/RCTAppDelegate
// in this RN/Expo version doesn't already declare this method.
const APP_DELEGATE_SCENE_METHOD = `

  public func application(
    _ application: UIApplication,
    configurationForConnecting connectingSceneSession: UISceneSession,
    options: UIScene.ConnectionOptions
  ) -> UISceneConfiguration {
    let configuration = UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
    configuration.delegateClass = SceneDelegate.self
    return configuration
  }`;

const withSceneDelegateFile = (config) => {
  return withXcodeProject(config, (config) => {
    const projectRoot = config.modRequest.projectRoot;
    const platformProjectRoot = config.modRequest.platformProjectRoot;
    const projectName = IOSConfig.XcodeUtils.getProjectName(projectRoot);

    const targetDir = path.join(platformProjectRoot, projectName);
    const targetFile = path.join(targetDir, "SceneDelegate.swift");
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(targetFile, SCENE_DELEGATE_SOURCE);

    IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
      filepath: targetFile,
      groupName: projectName,
      project: config.modResults,
    });

    return config;
  });
};

const withSceneManifest = (config) => {
  return withInfoPlist(config, (config) => {
    config.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: "Default Configuration",
            UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).SceneDelegate",
          },
        ],
      },
    };
    return config;
  });
};

const withAppDelegateSceneConfig = (config) => {
  return withAppDelegate(config, (config) => {
    const contents = config.modResults.contents;
    if (!contents.includes(APP_DELEGATE_ANCHOR)) {
      throw new Error(
        "withIosSceneDelegate: couldn't find the expected anchor in AppDelegate.swift — Expo's template must have changed. Update plugins/withIosSceneDelegate.js to match."
      );
    }
    if (!contents.includes("configurationForConnecting")) {
      config.modResults.contents = contents.replace(APP_DELEGATE_ANCHOR, APP_DELEGATE_ANCHOR + APP_DELEGATE_SCENE_METHOD);
    }
    return config;
  });
};

const withIosSceneDelegate = (config) => {
  config = withSceneManifest(config);
  config = withAppDelegateSceneConfig(config);
  config = withSceneDelegateFile(config);
  return config;
};

module.exports = withIosSceneDelegate;
