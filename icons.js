/* 작심 아이콘 — 이모지 대신 앱 톤에 맞춘 단색 선 아이콘.
 * 모두 24×24 좌표계, 색은 currentColor를 따른다. */

const ICONS = {
  stone: {
    label: "돌탑",
    path: `<ellipse cx="12" cy="17.4" rx="6.6" ry="2.5"/>
           <ellipse cx="12" cy="12.4" rx="5" ry="2.2"/>
           <ellipse cx="12" cy="8" rx="3.5" ry="1.9"/>`,
  },
  water: {
    label: "물",
    path: `<path d="M12 3.5c3.4 3.8 5.4 6.6 5.4 9.2A5.4 5.4 0 0 1 12 18.1a5.4 5.4 0 0 1-5.4-5.4c0-2.6 2-5.4 5.4-9.2Z"/>
           <path d="M9.5 13.2a2.6 2.6 0 0 0 2.1 2.4" stroke-opacity=".55"/>`,
  },
  book: {
    label: "독서",
    path: `<path d="M4 5.4c2.6-.7 5.2-.7 7.8 0v13c-2.6-.7-5.2-.7-7.8 0v-13Z"/>
           <path d="M20 5.4c-2.6-.7-5.2-.7-7.8 0v13c2.6-.7 5.2-.7 7.8 0v-13Z"/>`,
  },
  run: {
    label: "운동",
    path: `<circle cx="15.2" cy="4.9" r="1.9"/>
           <path d="M15.4 8.4l-3.6 2.6 1.6 3.4 2.9 1.5"/>
           <path d="M13.4 14.4L10.6 20"/>
           <path d="M11.8 11l-3.6 1.3"/>`,
  },
  meditate: {
    label: "스트레칭",
    path: `<circle cx="12" cy="4.8" r="2"/>
           <path d="M12 8.2v5.4"/>
           <path d="M6.9 10.6c1.7 1.3 3.4 2 5.1 2s3.4-.7 5.1-2"/>
           <path d="M12 13.6l-2.9 5.6M12 13.6l2.9 5.6"/>`,
  },
  pen: {
    label: "쓰기",
    path: `<path d="M4.6 19.4l1-3.6L15.2 6.2a2 2 0 0 1 2.9 0l.1.1a2 2 0 0 1 0 2.9L8.6 18.8l-4 .6Z"/>
           <path d="M14.2 7.4l2.4 2.4" stroke-opacity=".55"/>`,
  },
  sun: {
    label: "아침",
    path: `<circle cx="12" cy="12.4" r="3.6"/>
           <path d="M12 4.6v1.8M12 18.4v1.8M4.6 12.4h1.8M17.6 12.4h1.8M6.8 7.2l1.3 1.3M15.9 16.3l1.3 1.3M17.2 7.2l-1.3 1.3M8.1 16.3l-1.3 1.3"/>`,
  },
  meal: {
    label: "식사",
    path: `<path d="M3.8 12.6h16.4c0 3.3-2.6 5.6-5.9 5.6H9.7c-3.3 0-5.9-2.3-5.9-5.6Z"/>
           <path d="M8.6 9.6c0-1.6 1.5-1.9 1.5-3.2M13 9.6c0-1.6 1.5-1.9 1.5-3.2" stroke-opacity=".6"/>`,
  },
  sleep: {
    label: "수면",
    path: `<path d="M19.2 14.6A7.4 7.4 0 0 1 9.4 4.8a7.6 7.6 0 1 0 9.8 9.8Z"/>`,
  },
  heart: {
    label: "마음",
    path: `<path d="M12 19.2s-6.8-3.9-6.8-8.4a3.8 3.8 0 0 1 6.8-2.4 3.8 3.8 0 0 1 6.8 2.4c0 4.5-6.8 8.4-6.8 8.4Z"/>`,
  },
};

const ICON_KEYS = Object.keys(ICONS);

/* 예전 데이터에 남아 있는 이모지를 아이콘으로 이어 준다 */
const EMOJI_TO_ICON = {
  "🪨": "stone",
  "💧": "water",
  "📚": "book",
  "🏃": "run",
  "🧘": "meditate",
  "✍️": "pen",
  "🌅": "sun",
  "🥗": "meal",
  "💪": "run",
  "💤": "sleep",
};

function iconSVG(key, size = 24) {
  const def = ICONS[key] || ICONS.stone;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none"
    stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true">${def.path}</svg>`;
}

/* 저장된 목표에서 아이콘 키를 꺼낸다 (구버전 emoji 필드 호환) */
function goalIcon(goal) {
  if (goal.icon && ICONS[goal.icon]) return goal.icon;
  if (goal.emoji && EMOJI_TO_ICON[goal.emoji]) return EMOJI_TO_ICON[goal.emoji];
  return "stone";
}
