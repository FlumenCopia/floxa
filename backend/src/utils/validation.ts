/**
 * Quality validation for textual questionnaire inputs.
 * Detects keyboard mashing, repeated characters, and insufficient length.
 */
export function validateDiscoveryTextQuality(text: unknown, fieldLabel: string): string | null {
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return `Please provide an answer for "${fieldLabel}".`;
  }

  const trimmed = text.trim();

  if (trimmed.length < 10) {
    return `Please provide a more detailed answer for "${fieldLabel}" (at least 10 characters).`;
  }

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length < 2) {
    return `Please use at least a couple of words to describe "${fieldLabel}".`;
  }

  // Check unique words (prevent e.g. 'test test test')
  const uniqueWords = new Set(words.map((w) => w.toLowerCase()));
  if (words.length >= 3 && uniqueWords.size < 2) {
    return `Please enter meaningful words for "${fieldLabel}", avoid repeating the same word.`;
  }

  // Check for repeated character sequences (e.g. 'aaaaa', 'asdfasdfasdf')
  if (/(.)\1{4,}/i.test(trimmed) || /(.{2,4})\1{2,}/i.test(trimmed)) {
    return `Please enter real words for "${fieldLabel}", avoid repeating character patterns.`;
  }

  // Check Latin words for gibberish consonant clusters (e.g. sdfhsdjkf, dfghjkl)
  const latinWords = words.filter((w) => /^[a-zA-Z]+$/.test(w));
  if (latinWords.length > 0) {
    for (const w of latinWords) {
      if (/[bcdfghjklmnpqrstvwxz]{5,}/i.test(w)) {
        return `Please enter meaningful text for "${fieldLabel}". Random keystrokes cannot be used to build your Brand DNA.`;
      }
    }

    const allLetters = trimmed.replace(/[^a-zA-Z]/g, '');
    if (allLetters.length >= 10) {
      const vowels = allLetters.match(/[aeiouy]/gi) || [];
      const vowelRatio = vowels.length / allLetters.length;
      if (vowelRatio < 0.15) {
        return `Please enter meaningful sentences for "${fieldLabel}". Keystroke mash cannot be used for Brand DNA.`;
      }
    }
  }

  return null;
}
