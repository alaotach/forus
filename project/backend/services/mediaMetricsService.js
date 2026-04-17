const MAX_RECENT_EVENTS = Number.parseInt(process.env.MEDIA_METRICS_RECENT_EVENTS || '100', 10);

const counters = {
  totalFailures: 0,
  byStage: {
    generate_upload_url: 0,
    s3_put: 0,
    complete_upload: 0,
    media_access: 0,
    media_download: 0,
    delete_media: 0,
    unknown: 0,
  },
  byStatusCode: {},
};

const recentEvents = [];

function normalizeStage(stage) {
  if (!stage || typeof stage !== 'string') return 'unknown';
  const normalized = stage.trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(counters.byStage, normalized)) {
    return normalized;
  }
  return 'unknown';
}

function trackMediaFailureMetric(event) {
  const stage = normalizeStage(event?.stage);
  const statusCode = Number.isInteger(event?.statusCode) ? event.statusCode : null;
  const errorCode = typeof event?.errorCode === 'string' ? event.errorCode : null;
  const message = typeof event?.message === 'string' ? event.message.slice(0, 300) : null;

  counters.totalFailures += 1;
  counters.byStage[stage] += 1;

  if (statusCode !== null) {
    const key = String(statusCode);
    counters.byStatusCode[key] = (counters.byStatusCode[key] || 0) + 1;
  }

  const metricEvent = {
    at: new Date().toISOString(),
    stage,
    statusCode,
    errorCode,
    message,
  };

  recentEvents.push(metricEvent);
  if (recentEvents.length > MAX_RECENT_EVENTS) {
    recentEvents.splice(0, recentEvents.length - MAX_RECENT_EVENTS);
  }

  return metricEvent;
}

function getMediaFailureMetrics() {
  return {
    counters,
    recentEvents,
  };
}

module.exports = {
  trackMediaFailureMetric,
  getMediaFailureMetrics,
};
