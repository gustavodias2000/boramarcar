import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider
// RCTLinkingManager vive no pod React-RCTLinking. Dependendo de como o
// projeto é gerado (frameworks estáticos x dinâmicos) ele já vem junto do
// módulo `React`; o canImport evita quebrar o build nos dois casos.
#if canImport(React_RCTLinking)
import React_RCTLinking
#endif

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "BarbershopApp",
      in: window,
      launchOptions: launchOptions
    )

    return true
  }

  /// Entrega ao React Native os links `barbershop://agendar/{uid}` abertos a
  /// partir do QR Code. Sem isto o iOS abre o app, mas o React Navigation
  /// nunca recebe a URL e o cliente cai na tela inicial.
  func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return RCTLinkingManager.application(app, open: url, options: options)
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
