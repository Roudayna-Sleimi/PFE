const crypto = require('crypto');
const { maskPhone, normalizePhone } = require('../utils/normalizePhone');

const buildError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const DEFAULT_PASSWORD_RESET_TTL_MS = 15 * 60 * 1000;
const DEFAULT_PASSWORD_RESET_COOLDOWN_MS = 60 * 1000;

const normalizeText = (value = '') => String(value || '').trim();
const normalizeEmail = (value = '') => normalizeText(value).toLowerCase();
const normalizeCode = (value = '') => normalizeText(value).replace(/\s+/g, '');

const asPositiveNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const hashValue = (value = '') => crypto.createHash('sha256').update(String(value)).digest('hex');
const createPasswordResetCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');
const isLikelyPhoneInput = (value = '') => String(value || '').replace(/\D/g, '').length >= 6;

const clearPasswordResetFields = (user) => {
  user.passwordResetCodeHash = null;
  user.passwordResetExpiresAt = null;
  user.passwordResetRequestedAt = null;
};

const findApprovedDemandeByIdentifier = async (Demande, identifier = '') => {
  if (!Demande) return null;

  const normalizedIdentifier = normalizeText(identifier);
  if (!normalizedIdentifier) return null;

  const normalizedPhone = normalizePhone(normalizedIdentifier);
  const phoneFilter = normalizedPhone && isLikelyPhoneInput(normalizedIdentifier)
    ? [{ telephone: normalizedPhone }, { telephone: normalizedIdentifier }]
    : [];

  return Demande.findOne({
    statut: 'approuvee',
    $or: [
      { username: normalizedIdentifier },
      ...phoneFilter,
    ],
  }).sort({ createdAt: -1 });
};

const syncUserPhoneFromDemande = async ({ User, Demande }, user, identifier = '') => {
  if (!user || user.phone) return user;
  if (!Demande) return user;

  const demande = await findApprovedDemandeByIdentifier(Demande, identifier || user.username);
  const normalizedPhone = normalizePhone(demande?.telephone);
  if (!normalizedPhone) return user;

  const phoneOwner = await User.findOne({ phone: normalizedPhone });
  if (phoneOwner && String(phoneOwner._id) !== String(user._id)) {
    return user;
  }

  user.phone = normalizedPhone;
  await user.save();
  return user;
};

const findUserByResetIdentifier = async ({ User, Demande }, identifier = '') => {
  const normalizedIdentifier = normalizeText(identifier);
  if (!normalizedIdentifier) return null;

  const normalizedPhone = normalizePhone(normalizedIdentifier);
  if (normalizedPhone && isLikelyPhoneInput(normalizedIdentifier)) {
    const userByPhone = await User.findOne({ phone: normalizedPhone });
    if (userByPhone) {
      return syncUserPhoneFromDemande({ User, Demande }, userByPhone, normalizedIdentifier);
    }
  }

  const demandeByPhone = await findApprovedDemandeByIdentifier(Demande, normalizedIdentifier);
  if (demandeByPhone?.username) {
    const userFromDemande = await User.findOne({ username: demandeByPhone.username });
    if (userFromDemande) {
      return syncUserPhoneFromDemande({ User, Demande }, userFromDemande, normalizedIdentifier);
    }
  }

  const userByUsername = await User.findOne({ username: normalizedIdentifier });
  if (userByUsername) {
    return syncUserPhoneFromDemande({ User, Demande }, userByUsername, normalizedIdentifier);
  }

  return null;
};

const buildForgotPasswordResponse = (config = {}, extras = {}) => {
  const payload = {
    message: 'Si un compte correspond a cet identifiant, un code de reinitialisation a ete prepare pour le numero enregistre.',
  };

  if (config?.debugCode && extras.code) {
    payload.code = extras.code;
    payload.expiresAt = extras.expiresAt;
  }

  if (extras.delivery) {
    payload.delivery = extras.delivery;
  }

  if (extras.phoneMasked) {
    payload.phoneMasked = extras.phoneMasked;
  }

  if (extras.warning) {
    payload.warning = extras.warning;
  }

  return payload;
};

// Title: Register a new user account.
const registerUser = async ({ User, bcrypt }, payload = {}) => {
  const username = normalizeText(payload.username);
  const password = normalizeText(payload.password);
  const email = normalizeEmail(payload.email);
  const phone = normalizePhone(payload.phone || payload.telephone);

  if (!username || !password) {
    throw buildError('Champs requis manquants', 400);
  }

  const exists = await User.findOne({ username });
  if (exists) {
    throw buildError('Utilisateur deja existant', 409);
  }

  if (email) {
    const emailExists = await User.findOne({ email });
    if (emailExists) {
      throw buildError('Email deja utilise', 409);
    }
  }

  if (phone) {
    const phoneExists = await User.findOne({ phone });
    if (phoneExists) {
      throw buildError('Numero de telephone deja utilise', 409);
    }
  }

  const hashed = await bcrypt.hash(password, 12);
  const user = await User.create({
    username,
    email: email || null,
    phone: phone || null,
    password: hashed,
  });
  return { message: 'Utilisateur cree', userId: user._id };
};

// Title: Authenticate a user and return a signed token.
const loginUser = async ({ User, bcrypt, jwt, jwtSecret }, payload = {}) => {
  const username = normalizeText(payload.username);
  const password = normalizeText(payload.password);

  const user = await User.findOne({ username });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    throw buildError('Identifiants incorrects', 401);
  }

  const token = jwt.sign(
    { id: user._id, username: user.username, role: user.role },
    jwtSecret,
    { expiresIn: '8h' }
  );

  return { token, username: user.username, role: user.role };
};

// Title: Generate a one-time password reset code for the registered phone number.
const requestPasswordReset = async ({ User, Demande, passwordResetConfig = {} }, payload = {}) => {
  const identifier = normalizeText(payload.identifier || payload.username || payload.phone);
  if (!identifier) {
    throw buildError('Identifiant ou numero requis', 400);
  }

  const user = await findUserByResetIdentifier({ User, Demande }, identifier);
  if (!user) {
    return buildForgotPasswordResponse(passwordResetConfig);
  }

  if (!user.phone) {
    throw buildError('Aucun numero de telephone n est enregistre pour ce compte.', 400);
  }

  const cooldownMs = asPositiveNumber(passwordResetConfig.cooldownMs, DEFAULT_PASSWORD_RESET_COOLDOWN_MS);
  const requestedAt = user.passwordResetRequestedAt ? new Date(user.passwordResetRequestedAt).getTime() : null;
  if (requestedAt && (Date.now() - requestedAt) < cooldownMs) {
    throw buildError('Veuillez patienter avant de demander un nouveau code.', 429);
  }

  const code = createPasswordResetCode();
  const expiresAt = new Date(Date.now() + asPositiveNumber(passwordResetConfig.ttlMs, DEFAULT_PASSWORD_RESET_TTL_MS));
  user.passwordResetCodeHash = hashValue(code);
  user.passwordResetExpiresAt = expiresAt;
  user.passwordResetRequestedAt = new Date();
  await user.save();

  if (passwordResetConfig.debugCode) {
    return buildForgotPasswordResponse(passwordResetConfig, {
      code,
      expiresAt,
      delivery: 'debug',
      phoneMasked: maskPhone(user.phone),
      warning: 'Mode debug actif: le code n a pas ete envoye par SMS et est retourne par l API.',
    });
  }

  clearPasswordResetFields(user);
  await user.save();
  throw buildError('Service SMS non configure. Activez PASSWORD_RESET_DEBUG_CODE pour les tests ou branchez un provider SMS.', 500);
};

// Title: Validate a reset code and update the user password.
const resetPassword = async ({ User, Demande, bcrypt }, payload = {}) => {
  const identifier = normalizeText(payload.identifier || payload.username || payload.phone);
  const code = normalizeCode(payload.code);
  const newPassword = normalizeText(payload.newPassword);

  if (!identifier || !code || !newPassword) {
    throw buildError('Identifiant, code et nouveau mot de passe sont requis.', 400);
  }

  if (newPassword.length < 6) {
    throw buildError('Le nouveau mot de passe doit contenir au moins 6 caracteres.', 400);
  }

  const user = await findUserByResetIdentifier({ User, Demande }, identifier);
  if (!user?.passwordResetCodeHash || !user?.passwordResetExpiresAt) {
    throw buildError('Code invalide ou expire.', 400);
  }

  if (new Date(user.passwordResetExpiresAt).getTime() < Date.now()) {
    clearPasswordResetFields(user);
    await user.save();
    throw buildError('Code invalide ou expire.', 400);
  }

  if (hashValue(code) !== user.passwordResetCodeHash) {
    throw buildError('Code invalide ou expire.', 400);
  }

  user.password = await bcrypt.hash(newPassword, 12);
  clearPasswordResetFields(user);
  await user.save();

  return { message: 'Mot de passe mis a jour avec succes.' };
};

module.exports = {
  registerUser,
  loginUser,
  requestPasswordReset,
  resetPassword,
};
