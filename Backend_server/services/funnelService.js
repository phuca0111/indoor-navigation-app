const funnelRepository = require('../repositories/funnelRepository');

const STAGES = funnelRepository.STAGES;

async function recordStage(input) {
  if (!STAGES.includes(input.stage)) {
    throw Object.assign(new Error('Funnel stage không hợp lệ.'), {
      code: 'FUNNEL_STAGE_INVALID'
    });
  }
  const filter = input.event_id
    ? { event_id: String(input.event_id) }
    : {
        organization_id: input.organization_id || null,
        subject_type: input.subject_type,
        subject_id: String(input.subject_id),
        stage: input.stage
      };
  return funnelRepository.upsertStage(filter, {
    event_id: String(
      input.event_id ||
      `${input.stage}:${input.subject_type}:${input.subject_id}`
    ),
    stage: input.stage,
    subject_type: input.subject_type,
    subject_id: String(input.subject_id),
    organization_id: input.organization_id || null,
    session_id: input.session_id || '',
    occurred_at: input.occurred_at || new Date(),
    properties: input.properties || {}
  });
}

async function recordDomainEvent(event) {
  const stageByType = {
    PaymentSucceeded: 'PaymentCaptured',
    MapPublished: 'FirstMapPublished',
    SubscriptionActivated: 'SubscriptionActivated',
    TrialStarted: 'TrialStarted',
    CheckoutStarted: 'CheckoutStarted',
    NavigationCompleted: 'FirstNavigationCompleted'
  };
  const stage = stageByType[event.type];
  if (!stage) return null;
  return recordStage({
    event_id: event.event_id,
    stage,
    subject_type: event.organization_id ? 'Organization' : event.aggregate_type,
    subject_id: event.organization_id || event.aggregate_id,
    organization_id: event.organization_id || null,
    session_id: event.payload?.session_id || '',
    occurred_at: event.occurred_at,
    properties: event.payload || {}
  });
}

async function getFunnel({ organization_id, from, to, system = false } = {}) {
  // Fail-closed: SYSTEM must opt-in via system:true.
  // organization_id null/undefined without system=true is rejected.
  if (system !== true && !organization_id) {
    throw Object.assign(
      new Error('Funnel yêu cầu organization scope tường minh hoặc system=true.'),
      { status: 400, code: 'FUNNEL_SCOPE_REQUIRED' }
    );
  }
  const match = {};
  if (organization_id) match.organization_id = organization_id;
  if (from || to) {
    match.occurred_at = {};
    if (from) match.occurred_at.$gte = new Date(from);
    if (to) match.occurred_at.$lte = new Date(to);
  }
  const rows = await funnelRepository.aggregateFunnel([
    { $match: match },
    {
      $group: {
        _id: '$stage',
        count: { $sum: 1 },
        subjects: { $addToSet: '$subject_id' }
      }
    }
  ]);
  const counts = Object.fromEntries(
    (rows || []).map((row) => [row._id, (row.subjects || []).length])
  );
  return {
    stages: STAGES.map((stage, index) => {
      const count = counts[stage] || 0;
      const previous = index ? counts[STAGES[index - 1]] || 0 : count;
      return {
        stage,
        count,
        conversion_from_previous: previous
          ? Math.round((count / previous) * 10000) / 100
          : 0
      };
    })
  };
}

module.exports = { STAGES, recordStage, recordDomainEvent, getFunnel };
