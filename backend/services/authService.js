// Title: Register a new user account.
const registerUser = async ({ User, bcrypt }, payload = {}) => {
  const { username, password } = payload;
  if (!username || !password) {
    const error = new Error('Champs requis manquants');
    error.statusCode = 400;
    throw error;
  }

  const exists = await User.findOne({ username });
  if (exists) {
    const error = new Error('Utilisateur deja existant');
    error.statusCode = 409;
    throw error;
  }

  const hashed = await bcrypt.hash(password, 12);
  const user = await User.create({ username, password: hashed });
  return { message: 'Utilisateur cree', userId: user._id };
};

// Title: Authenticate a user and return a signed token.
const loginUser = async ({ User, bcrypt, jwt, jwtSecret }, payload = {}) => {
  const { username, password } = payload;
  const user = await User.findOne({ username });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    const error = new Error('Identifiants incorrects');
    error.statusCode = 401;
    throw error;
  }

  const token = jwt.sign(
    { id: user._id, username: user.username, role: user.role },
    jwtSecret,
    { expiresIn: '8h' }
  );

  return { token, username: user.username, role: user.role };
};

module.exports = {
  registerUser,
  loginUser,
};
