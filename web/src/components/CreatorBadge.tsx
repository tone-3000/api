// src/components/CreatorBadge.tsx
import type { EmbeddedUser } from '../types';

interface Props {
  user: Pick<EmbeddedUser, 'username' | 'display_name' | 'is_verified' | 'avatar_url'>;
  size?: 'small' | 'large';
}

/**
 * Creator attribution (avatar + name) required on every tone list and detail
 * view. `display_name` is only set for verified creators, so fall back to
 * `@username`.
 */
export function CreatorBadge({ user, size = 'small' }: Props) {
  return (
    <span className={`creator-badge creator-badge--${size}`}>
      {user.avatar_url ? (
        <img src={user.avatar_url} alt="" className="creator-avatar" />
      ) : (
        <span className="creator-avatar creator-avatar--placeholder">
          {user.username.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className="creator-name">{user.display_name ?? `@${user.username}`}</span>
      {user.is_verified && (
        <span className="creator-verified" title="Verified creator" aria-label="Verified creator">✓</span>
      )}
    </span>
  );
}
