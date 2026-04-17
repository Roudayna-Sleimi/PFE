// Title: Build tasks and direct-messages service.
const createTaskMessageService = (deps) => {
  const { Task, DirectMessage, io } = deps;

  // Title: Create one task.
  const createTask = async (username, payload = {}) => {
    const { titre, description, priorite, deadline, assigneA } = payload;
    if (!titre) {
      const error = new Error('Titre requis');
      error.statusCode = 400;
      throw error;
    }
    const task = await Task.create({ titre, description, priorite, deadline, assigneA, creePar: username });
    io.emit('nouvelle-task', task);
    return task;
  };

  // Title: List tasks for current user.
  const listTasks = async (user = {}) => {
    const filter = user.role === 'admin' ? {} : { assigneA: user.username };
    return Task.find(filter).sort({ createdAt: -1 });
  };

  // Title: Update one task if user has access.
  const patchTask = async (taskId, user = {}, payload = {}) => {
    const task = await Task.findById(taskId);
    if (!task) {
      const error = new Error('Task introuvable');
      error.statusCode = 404;
      throw error;
    }

    if (user.role !== 'admin' && task.assigneA !== user.username) {
      const error = new Error('Acces refuse');
      error.statusCode = 403;
      throw error;
    }

    const allowed = ['titre', 'description', 'priorite', 'deadline', 'assigneA', 'statut'];
    allowed.forEach((field) => {
      if (payload[field] !== undefined) task[field] = payload[field];
    });
    await task.save();
    io.emit('task-updated', task);
    return task;
  };

  // Title: Delete one task.
  const deleteTask = async (taskId) => {
    await Task.findByIdAndDelete(taskId);
    io.emit('task-deleted', { id: taskId });
    return { message: 'Task supprimee' };
  };

  // Title: Return conversation history between two users.
  const listConversation = async (username, targetUsername) => {
    const messages = await DirectMessage.find({
      $or: [{ from: username, to: targetUsername }, { from: targetUsername, to: username }],
    }).sort({ createdAt: 1 }).limit(100);

    await DirectMessage.updateMany({ from: targetUsername, to: username, read: false }, { read: true });
    return messages;
  };

  // Title: Return unread messages count by sender.
  const unreadCounts = async (username) => {
    const unread = await DirectMessage.aggregate([
      { $match: { to: username, read: false } },
      { $group: { _id: '$from', count: { $sum: 1 } } },
    ]);

    const counts = {};
    unread.forEach((row) => {
      counts[row._id] = row.count;
    });
    return counts;
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
  createTaskMessageService,
};
