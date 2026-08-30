// -----------------------------------------------------------------
// Shared config - edit these freely from your phone, no server
// restart needed except a page refresh.
// -----------------------------------------------------------------
window.GAME_CONFIG = {
  ROUND_COUNT: 3,
  ROUND_SECONDS: 90,
  TEAM_START_HEALTH: 1000,
  SOLDIERS_PER_TEAM_START: 6,

  // Keywords typed in TikTok comments -> actions (also mirrored server-side)
  COMMENTS: {
    RED: 'SUPPORT_RED',
    BLUE: 'SUPPORT_BLUE',
    ATTACK: 'MEGA_ATTACK',
    HEAL: 'HEAL',
    BOSS: 'SPAWN_BOSS',
    METEOR: 'METEOR',
    SHIELD: 'SHIELD',
  },

  COLORS: {
    red: '#ff3b3b',
    blue: '#3b9dff',
    gold: '#ffd23b',
    bg: '#0b0e1a',
  },
};
