/**
 * Kindgerechte kroatische Wörter für das Galgenmännchen-Spiel.
 * Jedes Wort hat ein Emoji als Hinweis (sprachunabhängig, ideal für Kinder)
 * und eine kroatische Kategorie. Alle Buchstaben liegen im kroatischen
 * Alphabet ohne Digrafe (dž/lj/nj werden als Einzelbuchstaben geraten).
 */
export interface HangmanWord {
  word: string;
  emoji: string;
  category: string; // kroatisch
}

export const WORDS: HangmanWord[] = [
  // Životinje (Tiere)
  { word: 'MAČKA', emoji: '🐱', category: 'Životinja' },
  { word: 'PAS', emoji: '🐶', category: 'Životinja' },
  { word: 'KONJ', emoji: '🐴', category: 'Životinja' },
  { word: 'RIBA', emoji: '🐟', category: 'Životinja' },
  { word: 'PTICA', emoji: '🐦', category: 'Životinja' },
  { word: 'MEDVJED', emoji: '🐻', category: 'Životinja' },
  { word: 'ZEC', emoji: '🐰', category: 'Životinja' },
  { word: 'LAV', emoji: '🦁', category: 'Životinja' },
  { word: 'SLON', emoji: '🐘', category: 'Životinja' },
  { word: 'MIŠ', emoji: '🐭', category: 'Životinja' },
  { word: 'KRAVA', emoji: '🐮', category: 'Životinja' },
  { word: 'OVCA', emoji: '🐑', category: 'Životinja' },
  { word: 'PČELA', emoji: '🐝', category: 'Životinja' },
  { word: 'LEPTIR', emoji: '🦋', category: 'Životinja' },
  { word: 'ŽABA', emoji: '🐸', category: 'Životinja' },
  { word: 'LISICA', emoji: '🦊', category: 'Životinja' },
  { word: 'PINGVIN', emoji: '🐧', category: 'Životinja' },
  { word: 'KORNJAČA', emoji: '🐢', category: 'Životinja' },

  // Hrana (Essen)
  { word: 'JABUKA', emoji: '🍎', category: 'Hrana' },
  { word: 'BANANA', emoji: '🍌', category: 'Hrana' },
  { word: 'KRUH', emoji: '🍞', category: 'Hrana' },
  { word: 'SIR', emoji: '🧀', category: 'Hrana' },
  { word: 'JAGODA', emoji: '🍓', category: 'Hrana' },
  { word: 'KOLAČ', emoji: '🍰', category: 'Hrana' },
  { word: 'SLADOLED', emoji: '🍦', category: 'Hrana' },
  { word: 'VODA', emoji: '💧', category: 'Hrana' },
  { word: 'LUBENICA', emoji: '🍉', category: 'Hrana' },

  // Priroda (Natur)
  { word: 'SUNCE', emoji: '☀️', category: 'Priroda' },
  { word: 'MJESEC', emoji: '🌙', category: 'Priroda' },
  { word: 'ZVIJEZDA', emoji: '⭐', category: 'Priroda' },
  { word: 'CVIJET', emoji: '🌸', category: 'Priroda' },
  { word: 'DRVO', emoji: '🌳', category: 'Priroda' },
  { word: 'MORE', emoji: '🌊', category: 'Priroda' },
  { word: 'SNIJEG', emoji: '❄️', category: 'Priroda' },
  { word: 'OBLAK', emoji: '☁️', category: 'Priroda' },
  { word: 'DUGA', emoji: '🌈', category: 'Priroda' },

  // Stvari (Dinge)
  { word: 'KUĆA', emoji: '🏠', category: 'Stvari' },
  { word: 'AUTO', emoji: '🚗', category: 'Stvari' },
  { word: 'LOPTA', emoji: '⚽', category: 'Stvari' },
  { word: 'KNJIGA', emoji: '📖', category: 'Stvari' },
  { word: 'BICIKL', emoji: '🚲', category: 'Stvari' },
  { word: 'BALON', emoji: '🎈', category: 'Stvari' },
  { word: 'BROD', emoji: '⛵', category: 'Stvari' },
  { word: 'VLAK', emoji: '🚆', category: 'Stvari' },
  { word: 'ZVONO', emoji: '🔔', category: 'Stvari' },
];
