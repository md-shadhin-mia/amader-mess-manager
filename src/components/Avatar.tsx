import { useState } from 'react';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface AvatarProps {
  name?: string | null;
  photoUrl?: string | null;
  size?: AvatarSize;
  className?: string;
  alt?: string;
}

const SIZE_CLASSES: Record<AvatarSize, { container: string; text: string }> = {
  xs: { container: 'w-6 h-6', text: 'text-[10px]' },
  sm: { container: 'w-8 h-8', text: 'text-xs' },
  md: { container: 'w-10 h-10', text: 'text-sm' },
  lg: { container: 'w-16 h-16', text: 'text-xl' },
  xl: { container: 'w-24 h-24 text-2xl', text: 'text-2xl' },
};

const COLOR_PALETTES = [
  'bg-blue-600 text-white',
  'bg-emerald-600 text-white',
  'bg-violet-600 text-white',
  'bg-amber-600 text-white',
  'bg-rose-600 text-white',
  'bg-teal-600 text-white',
  'bg-indigo-600 text-white',
  'bg-cyan-600 text-white',
];

function getInitials(name?: string | null): string {
  if (!name || !name.trim()) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getColor(name?: string | null): string {
  if (!name) return COLOR_PALETTES[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % COLOR_PALETTES.length;
  return COLOR_PALETTES[index];
}

export default function Avatar({
  name,
  photoUrl,
  size = 'md',
  className = '',
  alt,
}: AvatarProps) {
  const [loadFailed, setLoadFailed] = useState(false);
  const sizeConfig = SIZE_CLASSES[size];
  const initials = getInitials(name);
  const fallbackColor = getColor(name);

  const hasPhoto = Boolean(photoUrl && photoUrl.trim() && !loadFailed);

  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 rounded-full overflow-hidden font-semibold select-none shadow-xs transition-transform ${sizeConfig.container} ${hasPhoto ? 'bg-gray-100 dark:bg-gray-800' : fallbackColor} ${className}`}
    >
      {hasPhoto ? (
        <img
          src={photoUrl!}
          alt={alt || name || 'Avatar'}
          onError={() => setLoadFailed(true)}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      ) : (
        <span className={`${sizeConfig.text} uppercase tracking-wider`}>{initials}</span>
      )}
    </div>
  );
}
