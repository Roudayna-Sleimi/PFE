// Title: Build monitoring and maintenance service.
const createMonitoringService = (deps) => {
  const {
    SensorData,
    Alert,
    Contact,
    CallLog,
    MaintenanceReport,
    MaintenanceRequest,
    io,
    sanitizeSeverity,
    resolveMachineIdentity,
    buildMaintenanceAssessment,
    assessMaintenanceRisk,
    createMaintenanceCase,
  } = deps;

  // Title: Return latest sensor history rows.
  const sensorsHistory = async () => {
    const data = await SensorData.find().sort({ createdAt: -1 }).limit(50);
    return data.reverse();
  };

  // Title: Return alerts with optional status and limit filters.
  const listAlerts = async (query = {}) => {
    const { status, limit = 100 } = query;
    const filter = {};
    if (status) filter.status = status;
    return Alert.find(filter).sort({ createdAt: -1 }).limit(Number(limit));
  };

  // Title: Return pending new alerts older than max age.
  const pendingAlerts = async (query = {}) => {
    const maxAgeMinutes = Number(query.maxAgeMinutes || 5);
    const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000);
    return Alert.find({ status: 'new', seenAt: null, createdAt: { $lte: cutoff } }).sort({ createdAt: 1 }).limit(200);
  };

  // Title: Create one manual alert.
  const createAlert = async (payload = {}) => {
    const { machineId, node, type, severity, message, sensorSnapshot, ai } = payload;
    if (!message) {
      const error = new Error('Message requis');
      error.statusCode = 400;
      throw error;
    }

    const alert = await Alert.create({
      machineId: machineId || 'UNKNOWN',
      node: node || 'UNKNOWN',
      type: type || 'manual',
      severity: sanitizeSeverity(severity),
      message,
      sensorSnapshot: sensorSnapshot || {},
      ai: ai || { source: 'manual' },
    });
    io.emit('alert', alert);
    return alert;
  };

  // Title: Mark an alert as seen.
  const markAlertSeen = async (alertId, username) => {
    const alert = await Alert.findById(alertId);
    if (!alert) {
      const error = new Error('Alerte introuvable');
      error.statusCode = 404;
      throw error;
    }

    if (alert.status !== 'resolved') {
      alert.status = 'seen';
      alert.seenAt = new Date();
      alert.seenBy = username;
      await alert.save();
    }
    return alert;
  };

  // Title: Mark an alert as resolved.
  const resolveAlert = async (alertId, username) => {
    const alert = await Alert.findById(alertId);
    if (!alert) {
      const error = new Error('Alerte introuvable');
      error.statusCode = 404;
      throw error;
    }

    alert.status = 'resolved';
    if (!alert.seenAt) {
      alert.seenAt = new Date();
      alert.seenBy = username;
    }
    await alert.save();
    return alert;
  };

  // Title: Mark an alert as notified by GSM worker.
  const markAlertNotified = async (alertId, payload = {}) => {
    const { notifiedBy = 'gsm-supervisor' } = payload;
    const alert = await Alert.findById(alertId);
    if (!alert) {
      const error = new Error('Alerte introuvable');
      error.statusCode = 404;
      throw error;
    }

    alert.status = 'notified';
    alert.notifiedAt = new Date();
    alert.notifiedBy = notifiedBy;
    alert.callAttempts = (alert.callAttempts || 0) + 1;
    await alert.save();
    return alert;
  };

  // Title: Return all contacts.
  const listContacts = async () => {
    return Contact.find().sort({ createdAt: -1 });
  };

  // Title: Return active contact.
  const activeContact = async () => {
    return Contact.findOne({ isActive: true }).sort({ createdAt: -1 });
  };

  // Title: Create one contact.
  const createContact = async (payload = {}) => {
    const { role, name, phonePrimary, phoneBackup, isActive = true } = payload;
    if (!name || !phonePrimary) {
      const error = new Error('Nom et numero requis');
      error.statusCode = 400;
      throw error;
    }
    return Contact.create({ role, name, phonePrimary, phoneBackup, isActive });
  };

  // Title: Update one contact.
  const patchContact = async (contactId, payload = {}) => {
    const updates = ['role', 'name', 'phonePrimary', 'phoneBackup', 'isActive'].reduce((acc, key) => {
      if (payload[key] !== undefined) acc[key] = payload[key];
      return acc;
    }, {});

    const contact = await Contact.findByIdAndUpdate(contactId, updates, { returnDocument: 'after' });
    if (!contact) {
      const error = new Error('Contact introuvable');
      error.statusCode = 404;
      throw error;
    }
    return contact;
  };

  // Title: Create one call log row.
  const createCallLog = async (payload = {}) => {
    const {
      alertId,
      phoneNumber,
      attemptNo,
      callStatus,
      providerRef,
      durationSec,
      errorMessage,
      audioFilePath,
      audioFormat,
      audioBase64,
    } = payload;

    if (!alertId || !phoneNumber || !attemptNo) {
      const error = new Error('alertId, phoneNumber, attemptNo requis');
      error.statusCode = 400;
      throw error;
    }

    return CallLog.create({
      alertId,
      phoneNumber,
      attemptNo,
      callStatus: callStatus || 'queued',
      providerRef: providerRef || null,
      durationSec: durationSec || null,
      errorMessage: errorMessage || null,
      audioFilePath: audioFilePath || null,
      audioFormat: audioFormat || null,
      audioBase64: audioBase64 || null,
    });
  };

  // Title: Return call logs for one alert.
  const listCallLogs = async (alertId) => {
    return CallLog.find({ alertId }).sort({ calledAt: -1 });
  };

  // Title: Return maintenance reports list.
  const maintenanceReports = async (query = {}) => {
    const { machineId, status, limit = 100 } = query;
    const filter = {};
    if (machineId) filter.machineId = String(machineId);
    if (status) filter.status = String(status);
    return MaintenanceReport.find(filter).sort({ createdAt: -1 }).limit(Number(limit));
  };

  // Title: Return maintenance requests list.
  const maintenanceRequests = async (query = {}) => {
    const { status, limit = 100 } = query;
    const filter = {};
    if (status) filter.status = String(status);
    return MaintenanceRequest.find(filter).sort({ createdAt: -1 }).limit(Number(limit));
  };

  // Title: Return maintenance dashboard overview.
  const maintenanceOverview = async () => {
    const [reports, requests, latestSensors] = await Promise.all([
      MaintenanceReport.find({}).sort({ createdAt: -1 }).limit(100).lean(),
      MaintenanceRequest.find({}).sort({ createdAt: -1 }).limit(100).lean(),
      SensorData.aggregate([
        { $sort: { createdAt: -1 } },
        { $group: { _id: '$node', doc: { $first: '$$ROOT' } } },
        { $replaceRoot: { newRoot: '$doc' } },
      ]),
    ]);

    const sensorCards = latestSensors.map((sensor) => {
      const identity = resolveMachineIdentity(sensor);
      const report = reports.find((row) => row.machineId === identity.machineId || row.node === identity.node);
      const request = requests.find((row) => (row.machineId === identity.machineId || row.node === identity.node) && ['open', 'in_progress'].includes(row.status));
      const assessment = buildMaintenanceAssessment(sensor, []);
      return {
        ...identity,
        latestSensor: sensor,
        severity: report?.severity || assessment.severity,
        anomalyScore: report?.anomalyScore ?? assessment.anomalyScore,
        prediction: report?.prediction || assessment.prediction,
        recommendedAction: report?.recommendedAction || assessment.recommendedAction,
        lastReport: report || null,
        openRequest: request || null,
      };
    });

    return {
      machines: sensorCards,
      reports: reports.slice(0, 20),
      requests: requests.slice(0, 20),
      counts: {
        openRequests: requests.filter((row) => ['open', 'in_progress'].includes(row.status)).length,
        criticalReports: reports.filter((row) => row.severity === 'critical' && row.status !== 'resolved').length,
        warningReports: reports.filter((row) => row.severity === 'warning' && row.status !== 'resolved').length,
      },
    };
  };

  // Title: Run maintenance analysis for one machine.
  const maintenanceAnalyze = async (payload = {}) => {
    const { machineId, node } = payload;
    const filter = {};
    if (node) filter.node = node;
    else if (machineId) filter.$or = [{ machineId }, { node: machineId }];

    const latest = await SensorData.findOne(filter).sort({ createdAt: -1 }).lean();
    if (!latest) {
      const error = new Error('Aucune donnee capteur trouvee pour cette machine');
      error.statusCode = 404;
      throw error;
    }

    const assessment = await assessMaintenanceRisk({ ...latest, machineId: machineId || latest.machineId });
    if (assessment.severity === 'normal') {
      return { assessment, maintenance: null };
    }

    const alert = await Alert.create({
      machineId: assessment.machineId,
      node: assessment.node,
      type: 'maintenance-ai',
      severity: sanitizeSeverity(assessment.severity),
      message: assessment.message,
      ai: { source: 'backend-predictive-maintenance', label: assessment.severity, model: 'SensorBaselineRules', version: 'v1' },
      sensorSnapshot: assessment.sensorSnapshot,
    });
    io.emit('alert', alert);

    const maintenance = await createMaintenanceCase(latest, alert, assessment, 'manual-ai-analysis');
    return { assessment, alert, maintenance };
  };

  // Title: Update one maintenance request.
  const patchMaintenanceRequest = async (requestId, payload = {}, username = null) => {
    const updates = {};
    if (payload.status) updates.status = payload.status;
    if (updates.status === 'done' || updates.status === 'cancelled') {
      updates.resolvedAt = new Date();
      updates.resolvedBy = username;
    }

    const request = await MaintenanceRequest.findByIdAndUpdate(requestId, updates, { returnDocument: 'after' });
    if (!request) {
      const error = new Error('Demande maintenance introuvable');
      error.statusCode = 404;
      throw error;
    }

    io.emit('maintenance-request', request);
    return request;
  };

  return {
    sensorsHistory,
    listAlerts,
    pendingAlerts,
    createAlert,
    markAlertSeen,
    resolveAlert,
    markAlertNotified,
    listContacts,
    activeContact,
    createContact,
    patchContact,
    createCallLog,
    listCallLogs,
    maintenanceReports,
    maintenanceRequests,
    maintenanceOverview,
    maintenanceAnalyze,
    patchMaintenanceRequest,
  };
};

module.exports = {
  createMonitoringService,
};
