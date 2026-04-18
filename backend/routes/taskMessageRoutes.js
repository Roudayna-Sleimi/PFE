const express = require('express');
const { createTaskMessageController } = require('../controllers/taskMessageController');

// Title: Create tasks and messages routes.
const createTaskMessageRoutes = (deps) => {
  const { authMiddleware, adminMiddleware } = deps;
  const router = express.Router();
  const controller = createTaskMessageController(deps);

  router.post('/tasks', authMiddleware, adminMiddleware, controller.createTask);
  router.get('/tasks', authMiddleware, controller.listTasks);
  router.patch('/tasks/:id', authMiddleware, controller.patchTask);
  router.delete('/tasks/:id', authMiddleware, adminMiddleware, controller.deleteTask);

  router.get('/messages/:targetUsername', authMiddleware, controller.listConversation);
  router.get('/messages/unread/counts', authMiddleware, controller.unreadCounts);

  return router;
};

module.exports = {
  createTaskMessageRoutes,
};
