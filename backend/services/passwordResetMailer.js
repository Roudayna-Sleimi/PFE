const formatRemainingDelay = (expiresAt) => {
  const expiresAtMs = new Date(expiresAt).getTime();
  if (Number.isNaN(expiresAtMs)) return 'quelques minutes';
  const remainingMinutes = Math.max(1, Math.round((expiresAtMs - Date.now()) / (60 * 1000)));
  return `${remainingMinutes} minute${remainingMinutes > 1 ? 's' : ''}`;
};

const escapeHtml = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const parsePositiveInt = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseBoolean = (value = false) => ['true', '1', 'yes', 'on'].includes(String(value).toLowerCase());

// Title: Build a reusable mailer for password reset codes.
const createPasswordResetMailer = ({ nodemailer, config = {}, logger = console }) => {
  const host = String(config.host || '').trim();
  const port = parsePositiveInt(config.port, 587);
  const user = String(config.user || '').trim();
  const pass = String(config.pass || '').trim();
  const from = String(config.from || user || '').trim();
  const secure = parseBoolean(config.secure) || port === 465;
  const isReady = Boolean(host && port && user && pass && from);
  const transporter = isReady
    ? nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    })
    : null;

  const sendPasswordResetCode = async ({ email, username, code, expiresAt }) => {
    if (!transporter) {
      throw new Error('Le service email n est pas configure.');
    }

    const greetingName = username ? ` ${username}` : '';
    const remainingDelay = formatRemainingDelay(expiresAt);
    const safeCode = escapeHtml(code);
    const safeUsername = escapeHtml(username || '');

    await transporter.sendMail({
      from,
      to: email,
      subject: 'CNC Pulse - Code de reinitialisation',
      text: [
        `Bonjour${greetingName},`,
        '',
        `Votre code de reinitialisation est : ${code}`,
        `Ce code expire dans ${remainingDelay}.`,
        '',
        'Si vous n avez pas demande cette reinitialisation, vous pouvez ignorer cet email.',
      ].join('\n'),
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a">
          <p>Bonjour${safeUsername ? ` ${safeUsername}` : ''},</p>
          <p>Votre code de reinitialisation CNC Pulse est :</p>
          <p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:18px 0">${safeCode}</p>
          <p>Ce code expire dans ${escapeHtml(remainingDelay)}.</p>
          <p>Si vous n avez pas demande cette reinitialisation, vous pouvez ignorer cet email.</p>
        </div>
      `,
    });

    logger?.info?.(`[auth] password reset email sent to ${email}`);
  };

  return {
    isReady,
    sendPasswordResetCode,
  };
};

module.exports = {
  createPasswordResetMailer,
};
