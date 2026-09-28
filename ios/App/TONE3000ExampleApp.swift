import SwiftUI

@main
struct TONE3000ExampleApp: App {
    var body: some Scene {
        WindowGroup {
            NavigationStack {
                LandingView()
            }
            .environment(PreviewPlayer.shared)
        }
    }
}
