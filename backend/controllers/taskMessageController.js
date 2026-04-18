const { createTaskMessageService } = require('../services/taskMessageService');

// Title: Send a consistent error payload for tasks and messages endpoints.
const handleError = (res, err) => {
  const statusCode = Number(err?.statusCode) || 500;
  return res.status(statusCode).json({
    message: statusCode >= 500 ? 'Erreur serveur' : (err?.message || 'Requete invalide'),
    error: err?.message || null,
  });
};

// Title: Build tasks and messages controllers with injected dependencies.
const createTaskMessageController = (deps) => {
  const service = createTaskMessageService(deps);

  // Title: Handle task creation endpoint.
  const createTask = async (req, res) => {
    try {
      const task = await service.createTask(req.user.username, req.body || {});
      return res.status(201).json(task);
    } catch (err) {
      return handleError(res, err);
    }
  };

  // Title: Handle tasks listing endpoint.
  const listTasks = async (req, res) => {
    try {
      const tasks = await service.listTasks(req.user || {});
      return res.json(tasks);
    } catch (err) {
      return handleError(res, err);
    }
  };

  // Title: Handle task update endpoint.
  const patchTask = async (req, res) => {
    try {
      const task = await service.patchTask(req.params.id, req.user || {}, req.body || {});
      return res.json(task);
    } catch (err) {
      return handleError(res, err);
    }
  };

  // Title: Handle task deletion endpoint.
  const deleteTask = async (req, res) => {
    try {
      const result = await service.deleteTask(req.params.id);
      return res.json(result);
    } catch (err) {
      return handleError(res, err);
    }
  };

  // Title: Handle conversation listing endpoint.
  const listConversation = async (req, res) => {
    try {
      const messages = await service.listConversation(req.user.username, req.params.targetUsername);
      return res.json(messages);
    } catch (err) {
      return handleError(res, err);
    }
  };

  // Title: Handle unread counts endpoint.
  const unreadCounts = async (req, res) => {
    try {
      const counts = await service.unreadCounts(req.user.username);
      return res.json(counts);
    } catch (err) {
      return handleError(res, err);
    }
  };

  return {
    createTask,
    listTasks,
    patchTask,
    deleteTask,
    listConversation,
    unreadCounts,
  };
};

module.exports = {
  createTaskMessageController,
};
