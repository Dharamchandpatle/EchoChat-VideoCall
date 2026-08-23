export const DEFAULT_AVATAR = "/default-avatar.svg";
const LEGACY_AVATAR_HOST = "avatar.iran.liara.run";

export function getAvatarUrl(profilePic) {
  if (!profilePic || profilePic.includes(LEGACY_AVATAR_HOST)) return DEFAULT_AVATAR;
  return profilePic;
}

export function handleAvatarError(event) {
  event.currentTarget.onerror = null;
  event.currentTarget.src = DEFAULT_AVATAR;
}
