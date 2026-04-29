const normalizePhone = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const hasLeadingPlus = raw.startsWith('+');
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';

  return hasLeadingPlus ? `+${digits}` : digits;
};

const maskPhone = (value = '') => {
  const normalized = normalizePhone(value);
  if (!normalized) return '';

  const hasLeadingPlus = normalized.startsWith('+');
  const digits = normalized.replace(/^\+/, '');
  const visible = digits.slice(-4);
  const hiddenCount = Math.max(0, digits.length - visible.length);
  const masked = `${'*'.repeat(Math.min(hiddenCount, 8))}${visible}`;
  return hasLeadingPlus ? `+${masked}` : masked;
};

module.exports = {
  normalizePhone,
  maskPhone,
};
