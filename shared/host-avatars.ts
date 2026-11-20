/// Catálogo de avatares ilustrados para hosts - los SVG viven en
/// public/avatars/hosts/{id}.svg (preview en B2B) y en el bundle de
/// la app (assets/avatars/hosts/). La fuente del arte es
/// scripts/generate-host-avatars.mjs - si se agregan ids, regenerar.
export const HOST_AVATAR_IDS = [
  'bronce',
  'tide',
  'ember',
  'slate',
  'vine',
  'iron',
  'rosa',
  'terra',
  'amber',
  'onyx',
  'cielo',
  'lima',
] as const;

export type HostAvatarId = (typeof HOST_AVATAR_IDS)[number];

export function hostAvatarSrc(id?: string | null): string | null {
  return id && (HOST_AVATAR_IDS as readonly string[]).includes(id)
    ? `/avatars/hosts/${id}.svg`
    : null;
}
