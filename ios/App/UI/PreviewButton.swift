import SwiftUI

/// Play/pause control for one preview: spinner while loading, a progress ring
/// while playing. All buttons share `PreviewPlayer`, so starting one stops
/// whichever was playing.
struct PreviewButton: View {
    let id: String
    let resolve: () async throws -> PreviewChain
    var size: CGFloat = 36
    var onError: (String) -> Void = { _ in }

    @Environment(PreviewPlayer.self) private var player

    private var isActive: Bool { player.activePlayerId == id }
    private var isPlaying: Bool { isActive && player.isPlaying }
    private var isLoading: Bool { player.loadingPlayerId == id }
    private var progress: Double { isActive ? player.progress : 0 }

    var body: some View {
        Button {
            let resolve = resolve
            Task {
                do {
                    try await player.togglePlay(id: id, resolve: resolve)
                } catch {
                    onError(error.message)
                }
            }
        } label: {
            ZStack {
                Circle().stroke(Color.accentColor.opacity(0.2), lineWidth: 2)
                if isLoading {
                    ProgressView().controlSize(.small)
                } else {
                    Circle()
                        .trim(from: 0, to: progress)
                        .stroke(Color.accentColor, style: StrokeStyle(lineWidth: 2, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                    Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                        .font(.system(size: size * 0.36))
                        .foregroundStyle(Color.accentColor)
                        .offset(x: isPlaying ? 0 : size * 0.03)
                }
            }
            .frame(width: size, height: size)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(isPlaying ? "Pause preview" : "Play preview")
    }
}
