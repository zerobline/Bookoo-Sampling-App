// Cosmetic rewards. Every REWARD_STEP stars unlock the next item in REWARDS.
// No shop, no currency to spend: stars only ever go up.

export const REWARD_STEP = 20;

/** Always available, before any reward is earned. */
export const BASE_AVATARS = ['🦊', '🐱', '🐶', '🐻', '🐰', '🐯'];

export const BACKGROUNDS = {
  standard: { name: 'Himmel', css: 'linear-gradient(180deg, #dff1ff 0%, #f7fbff 100%)' },
  wiese: { name: 'Wiese', css: 'linear-gradient(180deg, #e3f7d9 0%, #fbfff6 100%)' },
  sterne: {
    name: 'Sterne',
    css: 'radial-gradient(circle at 20% 30%, #fff6 2px, transparent 3px) 0 0/60px 60px, radial-gradient(circle at 70% 70%, #fff8 2px, transparent 3px) 0 0/80px 80px, linear-gradient(180deg, #c9d6ff 0%, #eef1ff 100%)',
  },
  sonne: { name: 'Sonne', css: 'radial-gradient(circle at 85% 10%, #ffe27a 0 70px, transparent 71px), linear-gradient(180deg, #fff1d6 0%, #fffaf0 100%)' },
  punkte: {
    name: 'Punkte',
    css: 'radial-gradient(circle, #ffd2e4 6px, transparent 7px) 0 0/44px 44px, linear-gradient(180deg, #fff0f6 0%, #fff9fc 100%)',
  },
  wellen: {
    name: 'Meer',
    css: 'repeating-linear-gradient(170deg, #d4f1f7 0 22px, #e8f9fc 22px 44px)',
  },
  regenbogen: {
    name: 'Regenbogen',
    css: 'linear-gradient(180deg, #ffe0e0 0%, #fff2d6 20%, #fffbd6 40%, #e2f9dc 60%, #dcedff 80%, #eee3ff 100%)',
  },
  weltall: {
    name: 'Weltall',
    css: 'radial-gradient(circle at 15% 20%, #fff 1.5px, transparent 2px) 0 0/70px 70px, radial-gradient(circle at 60% 55%, #fffa 1px, transparent 2px) 0 0/40px 40px, linear-gradient(180deg, #2b2f6b 0%, #4a4fa3 100%)',
    dark: true,
  },
};

/** Unlock order. kind: avatar | background | sticker */
export const REWARDS = [
  { id: 'avatar-panda', kind: 'avatar', value: '🐼' },
  { id: 'bg-wiese', kind: 'background', value: 'wiese' },
  { id: 'sticker-rakete', kind: 'sticker', value: '🚀' },
  { id: 'avatar-loewe', kind: 'avatar', value: '🦁' },
  { id: 'bg-sterne', kind: 'background', value: 'sterne' },
  { id: 'sticker-regenbogen', kind: 'sticker', value: '🌈' },
  { id: 'avatar-frosch', kind: 'avatar', value: '🐸' },
  { id: 'bg-sonne', kind: 'background', value: 'sonne' },
  { id: 'sticker-pokal', kind: 'sticker', value: '🏆' },
  { id: 'avatar-oktopus', kind: 'avatar', value: '🐙' },
  { id: 'bg-punkte', kind: 'background', value: 'punkte' },
  { id: 'sticker-dino', kind: 'sticker', value: '🦖' },
  { id: 'avatar-einhorn', kind: 'avatar', value: '🦄' },
  { id: 'bg-wellen', kind: 'background', value: 'wellen' },
  { id: 'sticker-krone', kind: 'sticker', value: '👑' },
  { id: 'avatar-pinguin', kind: 'avatar', value: '🐧' },
  { id: 'bg-regenbogen', kind: 'background', value: 'regenbogen' },
  { id: 'sticker-eis', kind: 'sticker', value: '🍦' },
  { id: 'avatar-drache', kind: 'avatar', value: '🐲' },
  { id: 'bg-weltall', kind: 'background', value: 'weltall' },
  { id: 'sticker-ufo', kind: 'sticker', value: '🛸' },
  { id: 'sticker-schmetterling', kind: 'sticker', value: '🦋' },
  { id: 'sticker-kleeblatt', kind: 'sticker', value: '🍀' },
  { id: 'sticker-stern', kind: 'sticker', value: '🌟' },
];

export function unlockedCount(totalStars) {
  return Math.min(Math.floor(Math.max(0, totalStars) / REWARD_STEP), REWARDS.length);
}

export function unlockedRewards(totalStars) {
  return REWARDS.slice(0, unlockedCount(totalStars));
}

/** Stars needed for reward at index i. */
export function starsFor(index) {
  return (index + 1) * REWARD_STEP;
}

/** Next locked reward and how many stars are missing, or null when everything is unlocked. */
export function nextReward(totalStars) {
  const i = unlockedCount(totalStars);
  if (i >= REWARDS.length) return null;
  return { reward: REWARDS[i], index: i, missing: starsFor(i) - totalStars };
}

export function availableAvatars(totalStars) {
  return [...BASE_AVATARS, ...unlockedRewards(totalStars).filter((r) => r.kind === 'avatar').map((r) => r.value)];
}

export function availableBackgrounds(totalStars) {
  return ['standard', ...unlockedRewards(totalStars).filter((r) => r.kind === 'background').map((r) => r.value)];
}

export function rewardPreview(reward) {
  if (reward.kind === 'background') return BACKGROUNDS[reward.value]?.css ?? '';
  return reward.value;
}
