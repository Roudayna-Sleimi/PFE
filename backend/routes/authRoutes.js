const express = require('express');
const { createAuthController } = require('../controllers/authController');

// Title: Create auth routes.
const createAuthRoutes = (deps) => {
  const router = express.Router();
  const controller = createAuthController(deps);

  router.post('/register', controller.register);
  router.post('/login', controller.login);
  router.post('/forgot-password', controller.forgotPassword);
  router.post('/reset-password', controller.resetPassword);

  return router;
};

module.exports = {
  createAuthRoutes,
};
