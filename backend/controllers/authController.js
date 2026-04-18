const authService = require('../services/authService');

// Title: Send a consistent error payload for auth endpoints.
const handleError = (res, err) => {
  const statusCode = Number(err?.statusCode) || 500;
  return res.status(statusCode).json({
    message: statusCode >= 500 ? 'Erreur serveur' : (err?.message || 'Requete invalide'),
    error: err?.message || null,
  });
};

// Title: Build auth controllers with injected dependencies.
const createAuthController = (deps) => {
  const register = async (req, res) => {
    try {
      const result = await authService.registerUser(deps, req.body || {});
      return res.status(201).json(result);
    } catch (err) {
      return handleError(res, err);
    }
  };

  const login = async (req, res) => {
    try {
      const result = await authService.loginUser(deps, req.body || {});
      return res.json(result);
    } catch (err) {
      return handleError(res, err);
    }
  };

  return {
    register,
    login,
  };
};

module.exports = {
  createAuthController,
};
