/**
 * Eigene SVG-Kartenmotive (keine externen Bilder, keine Emojis).
 * Jedes Motiv hat eine eindeutige id, einen deutschen Namen und SVG-Markup.
 * Mit 12 Motiven sind bis zu 12 Paare (24 Karten) möglich.
 */
export interface CardMotif {
  id: string;
  name: string;
  svg: string;
}

export const CARD_MOTIFS: CardMotif[] = [
  {
    id: 'cat',
    name: 'Katze',
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <polygon points="22,18 38,40 18,44" fill="#f9a03f"/>
      <polygon points="78,18 62,40 82,44" fill="#f9a03f"/>
      <circle cx="50" cy="56" r="32" fill="#fbb45c"/>
      <circle cx="39" cy="52" r="5" fill="#2b2b2b"/>
      <circle cx="61" cy="52" r="5" fill="#2b2b2b"/>
      <polygon points="50,60 45,66 55,66" fill="#e76f8a"/>
      <path d="M50 66 Q44 72 38 70 M50 66 Q56 72 62 70" stroke="#2b2b2b" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <line x1="22" y1="58" x2="38" y2="60" stroke="#2b2b2b" stroke-width="2" stroke-linecap="round"/>
      <line x1="22" y1="64" x2="38" y2="64" stroke="#2b2b2b" stroke-width="2" stroke-linecap="round"/>
      <line x1="78" y1="58" x2="62" y2="60" stroke="#2b2b2b" stroke-width="2" stroke-linecap="round"/>
      <line x1="78" y1="64" x2="62" y2="64" stroke="#2b2b2b" stroke-width="2" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'dog',
    name: 'Hund',
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="24" cy="44" rx="11" ry="20" fill="#a9713f"/>
      <ellipse cx="76" cy="44" rx="11" ry="20" fill="#a9713f"/>
      <circle cx="50" cy="50" r="30" fill="#c98a4e"/>
      <ellipse cx="50" cy="64" rx="18" ry="14" fill="#f1d9b8"/>
      <circle cx="40" cy="46" r="4.5" fill="#2b2b2b"/>
      <circle cx="60" cy="46" r="4.5" fill="#2b2b2b"/>
      <ellipse cx="50" cy="58" rx="6" ry="4.5" fill="#2b2b2b"/>
      <path d="M50 62 V70" stroke="#2b2b2b" stroke-width="2.5"/>
      <path d="M50 70 Q43 74 40 68 M50 70 Q57 74 60 68" stroke="#2b2b2b" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'fox',
    name: 'Fuchs',
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <polygon points="20,20 34,46 14,40" fill="#ef7d35"/>
      <polygon points="80,20 66,46 86,40" fill="#ef7d35"/>
      <polygon points="22,26 32,44 20,40" fill="#2b2b2b"/>
      <polygon points="78,26 68,44 80,40" fill="#2b2b2b"/>
      <path d="M50 30 L74 50 Q50 80 26 50 Z" fill="#ef7d35"/>
      <path d="M50 48 L70 52 Q50 80 30 52 Z" fill="#fff5ec"/>
      <circle cx="40" cy="48" r="4" fill="#2b2b2b"/>
      <circle cx="60" cy="48" r="4" fill="#2b2b2b"/>
      <polygon points="50,60 46,65 54,65" fill="#2b2b2b"/>
    </svg>`,
  },
  {
    id: 'panda',
    name: 'Panda',
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <circle cx="28" cy="26" r="12" fill="#2b2b2b"/>
      <circle cx="72" cy="26" r="12" fill="#2b2b2b"/>
      <circle cx="50" cy="54" r="32" fill="#ffffff"/>
      <ellipse cx="38" cy="50" rx="9" ry="12" fill="#2b2b2b" transform="rotate(-15 38 50)"/>
      <ellipse cx="62" cy="50" rx="9" ry="12" fill="#2b2b2b" transform="rotate(15 62 50)"/>
      <circle cx="38" cy="51" r="4" fill="#fff"/>
      <circle cx="62" cy="51" r="4" fill="#fff"/>
      <ellipse cx="50" cy="64" rx="5" ry="3.5" fill="#2b2b2b"/>
      <path d="M50 68 Q45 73 41 70 M50 68 Q55 73 59 70" stroke="#2b2b2b" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'lion',
    name: 'Löwe',
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <g fill="#c8761f">
        <circle cx="50" cy="14" r="9"/><circle cx="74" cy="22" r="9"/><circle cx="86" cy="44" r="9"/>
        <circle cx="86" cy="64" r="9"/><circle cx="74" cy="82" r="9"/><circle cx="50" cy="90" r="9"/>
        <circle cx="26" cy="82" r="9"/><circle cx="14" cy="64" r="9"/><circle cx="14" cy="44" r="9"/><circle cx="26" cy="22" r="9"/>
      </g>
      <circle cx="50" cy="52" r="30" fill="#f4b43f"/>
      <circle cx="40" cy="48" r="4.5" fill="#2b2b2b"/>
      <circle cx="60" cy="48" r="4.5" fill="#2b2b2b"/>
      <polygon points="50,56 45,61 55,61" fill="#7a4a1e"/>
      <path d="M50 61 Q44 68 39 64 M50 61 Q56 68 61 64" stroke="#7a4a1e" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'frog',
    name: 'Frosch',
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <circle cx="32" cy="34" r="14" fill="#7ac043"/>
      <circle cx="68" cy="34" r="14" fill="#7ac043"/>
      <circle cx="32" cy="33" r="7" fill="#fff"/>
      <circle cx="68" cy="33" r="7" fill="#fff"/>
      <circle cx="32" cy="34" r="3.5" fill="#2b2b2b"/>
      <circle cx="68" cy="34" r="3.5" fill="#2b2b2b"/>
      <path d="M18 50 Q50 40 82 50 L82 58 Q50 84 18 58 Z" fill="#7ac043"/>
      <path d="M30 64 Q50 76 70 64" stroke="#2b6b1f" stroke-width="3" fill="none" stroke-linecap="round"/>
      <circle cx="34" cy="60" r="2.5" fill="#2b6b1f"/>
      <circle cx="66" cy="60" r="2.5" fill="#2b6b1f"/>
    </svg>`,
  },
  {
    id: 'owl',
    name: 'Eule',
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <polygon points="26,14 34,34 18,30" fill="#7d5a3c"/>
      <polygon points="74,14 66,34 82,30" fill="#7d5a3c"/>
      <path d="M50 20 C26 20 20 42 22 60 C24 82 40 90 50 90 C60 90 76 82 78 60 C80 42 74 20 50 20Z" fill="#9b6f47"/>
      <circle cx="38" cy="46" r="14" fill="#fff"/>
      <circle cx="62" cy="46" r="14" fill="#fff"/>
      <circle cx="38" cy="46" r="6" fill="#2b2b2b"/>
      <circle cx="62" cy="46" r="6" fill="#2b2b2b"/>
      <polygon points="50,52 44,58 56,58" fill="#f4a93f"/>
      <path d="M34 72 Q50 80 66 72" stroke="#6b4a2c" stroke-width="3" fill="none"/>
    </svg>`,
  },
  {
    id: 'fish',
    name: 'Fisch',
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <polygon points="78,50 96,34 96,66" fill="#1b9aaa"/>
      <ellipse cx="46" cy="50" rx="36" ry="24" fill="#22b8c4"/>
      <path d="M46 26 Q56 38 46 50 Z" fill="#1b9aaa"/>
      <path d="M46 74 Q56 62 46 50 Z" fill="#1b9aaa"/>
      <circle cx="26" cy="46" r="6" fill="#fff"/>
      <circle cx="25" cy="46" r="3" fill="#2b2b2b"/>
      <path d="M14 56 Q20 60 26 56" stroke="#0f6b78" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <circle cx="56" cy="44" r="4" fill="#7fe3ea"/>
      <circle cx="66" cy="54" r="4" fill="#7fe3ea"/>
    </svg>`,
  },
  {
    id: 'bee',
    name: 'Biene',
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="34" cy="38" rx="20" ry="14" fill="#dcf0ff" opacity="0.9" transform="rotate(-18 34 38)"/>
      <ellipse cx="66" cy="38" rx="20" ry="14" fill="#dcf0ff" opacity="0.9" transform="rotate(18 66 38)"/>
      <ellipse cx="50" cy="60" rx="27" ry="23" fill="#f6c945"/>
      <path d="M30 50 Q50 56 70 50" stroke="#2b2b2b" stroke-width="5" fill="none"/>
      <path d="M26 64 Q50 70 74 64" stroke="#2b2b2b" stroke-width="5" fill="none"/>
      <circle cx="42" cy="56" r="3.5" fill="#2b2b2b"/>
      <circle cx="58" cy="56" r="3.5" fill="#2b2b2b"/>
      <path d="M44 67 Q50 72 56 67" stroke="#2b2b2b" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <line x1="44" y1="26" x2="42" y2="38" stroke="#2b2b2b" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="56" y1="26" x2="58" y2="38" stroke="#2b2b2b" stroke-width="2.5" stroke-linecap="round"/>
      <circle cx="44" cy="24" r="3" fill="#2b2b2b"/>
      <circle cx="56" cy="24" r="3" fill="#2b2b2b"/>
    </svg>`,
  },
  {
    id: 'turtle',
    name: 'Schildkröte',
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="80" cy="56" rx="11" ry="8" fill="#8ad06a"/>
      <circle cx="85" cy="54" r="2.5" fill="#2b2b2b"/>
      <ellipse cx="30" cy="74" rx="8" ry="6" fill="#8ad06a"/>
      <ellipse cx="62" cy="78" rx="8" ry="6" fill="#8ad06a"/>
      <path d="M16 60 Q50 16 84 60 Z" fill="#3f9b46"/>
      <path d="M26 60 Q50 30 74 60 Z" fill="#5fb85a"/>
      <line x1="50" y1="34" x2="50" y2="60" stroke="#2f7a36" stroke-width="3"/>
      <line x1="34" y1="48" x2="66" y2="48" stroke="#2f7a36" stroke-width="3"/>
    </svg>`,
  },
  {
    id: 'penguin',
    name: 'Pinguin',
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="50" cy="54" rx="30" ry="36" fill="#2b2b2b"/>
      <ellipse cx="50" cy="60" rx="20" ry="28" fill="#fff"/>
      <circle cx="41" cy="40" r="4" fill="#2b2b2b"/>
      <circle cx="59" cy="40" r="4" fill="#2b2b2b"/>
      <polygon points="50,44 42,52 58,52" fill="#f4a93f"/>
      <polygon points="42,52 50,58 58,52" fill="#f4a93f"/>
      <ellipse cx="28" cy="84" rx="9" ry="5" fill="#f4a93f"/>
      <ellipse cx="72" cy="84" rx="9" ry="5" fill="#f4a93f"/>
    </svg>`,
  },
  {
    id: 'elephant',
    name: 'Elefant',
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="22" cy="50" rx="16" ry="22" fill="#9aa7b4"/>
      <ellipse cx="78" cy="50" rx="16" ry="22" fill="#9aa7b4"/>
      <circle cx="50" cy="48" r="28" fill="#b3bfca"/>
      <circle cx="40" cy="44" r="4.5" fill="#2b2b2b"/>
      <circle cx="60" cy="44" r="4.5" fill="#2b2b2b"/>
      <path d="M50 54 Q44 70 50 82 Q56 88 62 82" stroke="#9aa7b4" stroke-width="10" fill="none" stroke-linecap="round"/>
      <path d="M44 86 L40 93 M58 84 L60 92" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
    </svg>`,
  },
];
