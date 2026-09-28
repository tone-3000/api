import SwiftUI

/// Creator attribution (avatar + name + verified check), required on every
/// tone list and detail view. `display_name` is only set for verified
/// creators, so it falls back to `@username`.
struct CreatorBadge: View {
    let user: any CreatorInfo
    var large = false

    var body: some View {
        HStack(spacing: large ? 10 : 6) {
            Avatar(url: user.avatarUrl, initial: user.username.prefix(1).uppercased(), size: large ? 40 : 18)
            Text(user.creatorName)
                .font(large ? .headline : .caption)
                .foregroundStyle(large ? .primary : .secondary)
                .lineLimit(1)
            if user.isVerified == true {
                Image(systemName: "checkmark.seal.fill")
                    .font(large ? .subheadline : .caption2)
                    .foregroundStyle(.blue)
                    .accessibilityLabel("Verified creator")
            }
        }
    }
}

struct Avatar: View {
    let url: String?
    let initial: String
    let size: CGFloat

    var body: some View {
        Group {
            if let url, let parsed = URL(string: url) {
                AsyncImage(url: parsed) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    placeholder
                }
            } else {
                placeholder
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
    }

    private var placeholder: some View {
        Circle().fill(Color(.secondarySystemFill))
            .overlay(Text(initial).font(.system(size: size * 0.45, weight: .semibold)).foregroundStyle(.secondary))
    }
}

struct Badge: View {
    let text: String
    var tint: Color = .secondary

    var body: some View {
        Text(text.uppercased())
            .font(.system(size: 10, weight: .semibold))
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .foregroundStyle(tint)
            .background(tint.opacity(0.12), in: RoundedRectangle(cornerRadius: 4))
    }
}

struct ToneImage: View {
    let tone: Tone
    var size: CGFloat = 56

    var body: some View {
        Group {
            if let first = tone.images?.first, let url = URL(string: first) {
                AsyncImage(url: url) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    Color(.secondarySystemFill)
                }
            } else {
                Color(.secondarySystemFill)
                    .overlay(Image(systemName: "waveform").foregroundStyle(.secondary))
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}

/// Tone summary: image, title, creator, gear and format.
struct ToneRow: View {
    let tone: Tone

    var body: some View {
        HStack(spacing: 12) {
            ToneImage(tone: tone)
            VStack(alignment: .leading, spacing: 4) {
                Text(tone.title).font(.subheadline.weight(.semibold)).lineLimit(2)
                CreatorBadge(user: tone.user)
                HStack(spacing: 4) {
                    Badge(text: tone.gear.label, tint: .purple)
                    Badge(text: tone.format.label, tint: .blue)
                    if tone.isPublic == false { Badge(text: "Private") }
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 2)
    }
}

struct ErrorBanner: View {
    let message: String
    var onDismiss: (() -> Void)?

    var body: some View {
        HStack(alignment: .top) {
            Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.red)
            Text(message).font(.subheadline)
            Spacer()
            if let onDismiss {
                Button(action: onDismiss) { Image(systemName: "xmark") }.buttonStyle(.plain)
            }
        }
        .padding(12)
        .background(Color.red.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
    }
}

struct InfoBanner: View {
    let message: String

    var body: some View {
        HStack(alignment: .top) {
            Image(systemName: "info.circle.fill").foregroundStyle(.blue)
            Text(message).font(.subheadline)
            Spacer()
        }
        .padding(12)
        .background(Color.blue.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
    }
}

/// Primary "… TONE3000" call to action.
struct T3KButton: View {
    let title: String
    var busy = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack {
                if busy { ProgressView().tint(.white) }
                Text(title).fontWeight(.semibold)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
        }
        .buttonStyle(.borderedProminent)
        .disabled(busy)
    }
}

/// Simple Prev / Next pager.
struct Pager: View {
    @Binding var page: Int
    let totalPages: Int

    var body: some View {
        if totalPages > 1 {
            HStack {
                Button("← Prev") { page -= 1 }.disabled(page <= 1)
                Spacer()
                Text("Page \(page) of \(totalPages)").font(.caption).foregroundStyle(.secondary)
                Spacer()
                Button("Next →") { page += 1 }.disabled(page >= totalPages)
            }
            .buttonStyle(.borderless)
        }
    }
}

extension Error {
    /// User-facing message; rate limits get friendly copy via T3KError.
    var message: String { (self as? LocalizedError)?.errorDescription ?? localizedDescription }
}
