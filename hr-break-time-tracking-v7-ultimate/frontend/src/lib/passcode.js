export const PASSCODE_LENGTH = 3;
export const PASSCODE_MAX_ATTEMPTS = 5;

export const PASSCODE_ALLOWED_DESCRIPTION =
  'letters A–Z a–z, numbers 0–9, and keyboard symbols ! " # $ % & \' ( ) * + , - . / : ; < = > ? @ [ \\ ] ^ _ ` { | } ~';

export function isAllowedPasscodeChar(char) {
  if (!char || char.length !== 1) return false;
  const code = char.charCodeAt(0);
  return code >= 0x21 && code <= 0x7e;
}

export function validatePasscode(value, { confirmValue, requireConfirm = false } = {}) {
  const text = value ?? '';
  const invalid = [...text].filter((ch) => !isAllowedPasscodeChar(ch));
  if (invalid.length > 0) {
    const shown = [...new Set(invalid)].map((ch) => `'${ch}'`).join(', ');
    return `This character cannot be used: ${shown}. Use a letter, number, or keyboard symbol instead.`;
  }
  if (!text) return 'Enter your 3-character passcode.';
  if (text.length !== PASSCODE_LENGTH) return 'Passcode must be exactly 3 characters.';
  if (requireConfirm) {
    if (!(confirmValue ?? '')) return 'Confirm your passcode.';
    if (confirmValue !== text) return 'Passcode and confirm passcode do not match.';
  }
  return '';
}

export function filterPasscodeInput(nextValue) {
  const chars = [...String(nextValue ?? '')];
  const allowed = [];
  const rejected = [];
  for (const ch of chars) {
    if (!isAllowedPasscodeChar(ch)) rejected.push(ch);
    else if (allowed.length < PASSCODE_LENGTH) allowed.push(ch);
  }
  return {
    value: allowed.join(''),
    rejected,
    tooLong: chars.filter((ch) => isAllowedPasscodeChar(ch)).length > PASSCODE_LENGTH,
  };
}
