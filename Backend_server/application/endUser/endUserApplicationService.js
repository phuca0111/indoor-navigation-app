/**
 * End User Platform — application service (Dashboard · Explore · Activities · Subscription · Settings).
 * Tái dùng Hub / Place / Community / Creator — không nuốt Outdoor/Creator vào sidebar.
 */
const mongoose = require('mongoose');
const User = require('../../models/User');
const Place = require('../../models/Place');
const Building = require('../../models/Building');
const IndoorWorkspace = require('../../models/IndoorWorkspace');
const UserFavorite = require('../../models/UserFavorite');
const UserHistory = require('../../models/UserHistory');
const Notification = require('../../models/Notification');
const PlaceProposal = require('../../models/PlaceProposal');
const PlaceReview = require('../../models/PlaceReview');
const PlaceReport = require('../../models/PlaceReport');
const PlaceFollow = require('../../models/PlaceFollow');
const SubscriptionMockEvent = require('../../models/SubscriptionMockEvent');
const { placePublicMongoFilter, WORKSPACE_STATUS } = require('../../utils/placePlatform');
const { buildPlanSnapshot } = require('../../services/personalPlanGates');

const MOCK_ALLOWED = process.env.ALLOW_SUBSCRIPTION_MOCK !== '0';

function badRequest(message, code = 'BAD_REQUEST') {
  const err = new Error(message);
  err.status = 400;
  err.code = code;
  return err;
}

function placeCard(p) {
  if (!p) return null;
  return {
    _id: p._id,
    id: String(p._id),
    name: p.name,
    slug: p.slug || '',
    address: p.address || '',
    category: p.category || '',
    latitude: p.latitude,
    longitude: p.longitude,
    publication_status: p.publication_status,
    distance_m: p.distance_m != null ? p.distance_m : undefined
  };
}

function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toR = (d) => (d * Math.PI) / 180;
  const dLat = toR(lat2 - lat1);
  const dLng = toR(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function loadPlacesByIds(ids, limit = 20) {
  const oids = [...new Set(ids.map(String))]
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .slice(0, limit)
    .map((id) => new mongoose.Types.ObjectId(id));
  if (!oids.length) return [];
  const rows = await Place.find({ _id: { $in: oids } })
    .select('name slug address category latitude longitude publication_status')
    .lean();
  const map = Object.fromEntries(rows.map((p) => [String(p._id), p]));
  return oids.map((id) => map[String(id)]).filter(Boolean).map(placeCard);
}

function subscriptionDisplay(user, planInfo) {
  const raw = String(user.plan || 'FREE').toUpperCase();
  const tier = String(user.preferences?.subscription_tier || '').toUpperCase();
  if (raw === 'FREE' || !planInfo || planInfo.display_plan === 'DEMO') {
    return { code: 'DEMO', label: 'Demo', db_plan: raw };
  }
  if (tier === 'PROFESSIONAL') {
    return { code: 'PROFESSIONAL', label: 'Professional', db_plan: raw };
  }
  return { code: 'CREATOR', label: 'Creator', db_plan: raw };
}

async function getDashboard(userId, { lat, lng } = {}) {
  const user = await User.findById(userId).lean();
  if (!user) throw badRequest('User không tồn tại.', 'USER_NOT_FOUND');

  const planInfo = await buildPlanSnapshot(user);

  const [
    buildings,
    favRows,
    histRows,
    proposals,
    notifUnread,
    notifLatest,
    creatorStats
  ] = await Promise.all([
    Building.find({
      is_active: { $ne: false },
      $or: [{ owner_user_id: userId }, { created_by: userId }]
    })
      .sort({ updatedAt: -1 })
      .limit(5)
      .select('_id name workspace_status status updatedAt place_id')
      .lean(),
    UserFavorite.find({ user_id: userId }).sort({ createdAt: -1 }).limit(6).lean(),
    UserHistory.find({ user_id: userId, type: 'VIEW_PLACE', place_id: { $ne: null } })
      .sort({ createdAt: -1 })
      .limit(8)
      .lean(),
    PlaceProposal.find({ created_by: userId }).sort({ createdAt: -1 }).limit(20).lean(),
    Notification.countDocuments({ user_id: userId, read_at: null }),
    Notification.find({ user_id: userId }).sort({ createdAt: -1 }).limit(5).lean(),
    (async () => {
      try {
        const { getCreatorStats } = require('../creator/creatorApplicationService');
        return await getCreatorStats(userId);
      } catch (_) {
        return null;
      }
    })()
  ]);

  const favPlaces = await loadPlacesByIds(favRows.map((r) => r.place_id), 6);
  const recentPlaces = await loadPlacesByIds(histRows.map((r) => r.place_id), 6);

  const statusKey = (p) => String(p.status || p.proposal_status || 'DRAFT').toUpperCase();
  const proposalBuckets = { draft: 0, pending: 0, approved: 0, rejected: 0 };
  proposals.forEach((p) => {
    const s = statusKey(p);
    if (s.includes('APPROV') || s === 'ACCEPTED') proposalBuckets.approved += 1;
    else if (s.includes('REJECT')) proposalBuckets.rejected += 1;
    else if (s.includes('PEND') || s.includes('SUBMIT') || s === 'QUEUE') proposalBuckets.pending += 1;
    else proposalBuckets.draft += 1;
  });

  let nearby = [];
  if (lat != null && lng != null && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
    nearby = await exploreNearby(Number(lat), Number(lng), 8);
  }

  const continueEditing = buildings.map((b) => ({
    workspace_id: b._id,
    name: b.name,
    status: b.workspace_status || b.status || 'DRAFT',
    updatedAt: b.updatedAt,
    editor_url: '/editor/?buildingId=' + encodeURIComponent(String(b._id))
  }));

  return {
    continue_editing: continueEditing,
    recent_places: recentPlaces,
    favorites: favPlaces,
    proposals: {
      ...proposalBuckets,
      items: proposals.slice(0, 5).map((p) => ({
        _id: p._id,
        name: p.proposed_name || p.name || 'Proposal',
        status: statusKey(p)
      }))
    },
    creator_stats: creatorStats
      ? { funnel: creatorStats.funnel, stats: creatorStats.stats }
      : null,
    subscription: {
      ...subscriptionDisplay(user, planInfo),
      usage: planInfo?.usage || null,
      limits: planInfo?.limits || null,
      capabilities: planInfo?.capabilities || null
    },
    notifications: {
      unread: notifUnread,
      latest: notifLatest.map((n) => ({
        _id: n._id,
        title: n.title || n.type,
        body: n.body || n.message || '',
        read_at: n.read_at || null,
        createdAt: n.createdAt
      }))
    },
    nearby
  };
}

async function exploreNearby(lat, lng, limit = 20) {
  const rows = await Place.find(placePublicMongoFilter())
    .select('name slug address category latitude longitude publication_status')
    .limit(80)
    .lean();
  return rows
    .map((p) => {
      const d = haversineM(lat, lng, Number(p.latitude) || 0, Number(p.longitude) || 0);
      return { ...p, distance_m: Math.round(d) };
    })
    .sort((a, b) => a.distance_m - b.distance_m)
    .slice(0, limit)
    .map(placeCard);
}

async function getExplore(userId, { q, category, lat, lng, limit = 20 } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const filter = placePublicMongoFilter();
  if (category) {
    filter.category = new RegExp(String(category).trim(), 'i');
  }
  if (q) {
    const qq = String(q).trim();
    filter.$and = filter.$and || [];
    filter.$and.push({
      $or: [
        { name: new RegExp(qq, 'i') },
        { address: new RegExp(qq, 'i') },
        { category: new RegExp(qq, 'i') },
        { slug: new RegExp(qq, 'i') }
      ]
    });
  }

  let popular = [];
  try {
    popular = await Place.find(filter)
      .sort({ view_count: -1, updatedAt: -1 })
      .limit(lim)
      .select('name slug address category latitude longitude publication_status view_count')
      .lean();
  } catch (_) {
    popular = await Place.find(placePublicMongoFilter())
      .sort({ updatedAt: -1 })
      .limit(lim)
      .select('name slug address category latitude longitude publication_status')
      .lean();
  }

  const [favRows, histRows] = await Promise.all([
    UserFavorite.find({ user_id: userId }).sort({ createdAt: -1 }).limit(lim).lean(),
    UserHistory.find({ user_id: userId, type: 'VIEW_PLACE', place_id: { $ne: null } })
      .sort({ createdAt: -1 })
      .limit(lim)
      .lean()
  ]);

  const favorites = await loadPlacesByIds(favRows.map((r) => r.place_id), lim);
  const recent = await loadPlacesByIds(histRows.map((r) => r.place_id), lim);

  let nearby = [];
  if (lat != null && lng != null && Number.isFinite(Number(lat))) {
    nearby = await exploreNearby(Number(lat), Number(lng), lim);
  }

  // Search hits (optional)
  let search = [];
  if (q || category) {
    search = (await Place.find(filter)
      .limit(lim)
      .select('name slug address category latitude longitude publication_status')
      .lean()).map(placeCard);
  }

  return {
    nearby,
    recent,
    favorites,
    popular: popular.map(placeCard),
    search,
    q: q || null,
    category: category || null
  };
}

async function getActivities(userId, { type, limit = 40 } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 40, 1), 100);
  const t = String(type || 'ALL').toUpperCase();
  const items = [];

  const push = (row) => {
    if (items.length >= lim) return;
    items.push(row);
  };

  const want = (name) => t === 'ALL' || t === name;

  if (want('FAVORITE')) {
    const rows = await UserFavorite.find({ user_id: userId }).sort({ createdAt: -1 }).limit(lim).lean();
    const places = await loadPlacesByIds(rows.map((r) => r.place_id), lim);
    const pmap = Object.fromEntries(places.map((p) => [p.id, p]));
    rows.forEach((r) => {
      const p = pmap[String(r.place_id)];
      push({
        id: 'fav-' + r._id,
        type: 'FAVORITE',
        title: 'Đã yêu thích ' + (p?.name || 'Place'),
        body: p?.address || '',
        at: r.createdAt,
        href: p?.slug ? '/outdoor/place/' + p.slug : null,
        meta: { place_id: r.place_id }
      });
    });
  }

  if (want('HISTORY')) {
    const rows = await UserHistory.find({ user_id: userId }).sort({ createdAt: -1 }).limit(lim).lean();
    rows.forEach((r) => {
      push({
        id: 'hist-' + r._id,
        type: 'HISTORY',
        title: r.label || r.type,
        body: r.type,
        at: r.createdAt,
        href: null,
        meta: { history_type: r.type, place_id: r.place_id }
      });
    });
  }

  if (want('NOTIFICATION')) {
    const rows = await Notification.find({ user_id: userId }).sort({ createdAt: -1 }).limit(lim).lean();
    rows.forEach((r) => {
      push({
        id: 'notif-' + r._id,
        type: 'NOTIFICATION',
        title: r.title || r.type || 'Thông báo',
        body: r.body || r.message || '',
        at: r.createdAt,
        href: null,
        meta: { notification_id: r._id, read_at: r.read_at }
      });
    });
  }

  if (want('PROPOSAL')) {
    const rows = await PlaceProposal.find({ created_by: userId }).sort({ createdAt: -1 }).limit(lim).lean();
    rows.forEach((r) => {
      push({
        id: 'prop-' + r._id,
        type: 'PROPOSAL',
        title: r.proposed_name || r.name || 'Proposal',
        body: String(r.status || 'DRAFT'),
        at: r.createdAt || r.updatedAt,
        href: null,
        meta: { status: r.status }
      });
    });
  }

  if (want('REVIEW')) {
    const rows = await PlaceReview.find({ user_id: userId, is_active: { $ne: false } })
      .sort({ createdAt: -1 })
      .limit(lim)
      .lean();
    rows.forEach((r) => {
      push({
        id: 'rev-' + r._id,
        type: 'REVIEW',
        title: 'Đánh giá ★' + (r.rating || 0),
        body: (r.comment || '').slice(0, 120),
        at: r.createdAt,
        href: null,
        meta: { place_id: r.place_id, rating: r.rating }
      });
    });
  }

  items.sort((a, b) => new Date(b.at) - new Date(a.at));
  return { total: items.length, items: items.slice(0, lim) };
}

async function getSubscription(userId) {
  const user = await User.findById(userId).lean();
  if (!user) throw badRequest('User không tồn tại.');
  const planInfo = await buildPlanSnapshot(user);
  const history = await SubscriptionMockEvent.find({ user_id: userId })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();
  return {
    current: subscriptionDisplay(user, planInfo),
    usage: planInfo?.usage || null,
    limits: planInfo?.limits || null,
    capabilities: planInfo?.capabilities || null,
    plan_expires_at: user.plan_expires_at || null,
    billing_history_mock: history.map((h) => ({
      _id: h._id,
      from_plan: h.from_plan,
      to_plan: h.to_plan,
      target_label: h.target_label,
      amount_mock: h.amount_mock,
      currency: h.currency,
      note: h.note,
      createdAt: h.createdAt
    })),
    upgrade_path: ['DEMO', 'CREATOR', 'PROFESSIONAL'],
    mock_enabled: MOCK_ALLOWED
  };
}

async function upgradeMock(userId, targetPlan) {
  if (!MOCK_ALLOWED) {
    throw badRequest('Subscription mock đang tắt (ALLOW_SUBSCRIPTION_MOCK=0).', 'MOCK_DISABLED');
  }
  const target = String(targetPlan || '').toUpperCase();
  if (!['DEMO', 'CREATOR', 'PROFESSIONAL'].includes(target)) {
    throw badRequest('target_plan phải là DEMO | CREATOR | PROFESSIONAL.');
  }

  const user = await User.findById(userId);
  if (!user) throw badRequest('User không tồn tại.');

  const from = String(user.plan || 'FREE').toUpperCase();
  const fromTier = String(user.preferences?.subscription_tier || '').toUpperCase() ||
    (from === 'FREE' ? 'DEMO' : 'CREATOR');

  if (target === 'DEMO') {
    user.plan = 'FREE';
    user.plan_expires_at = null;
    user.preferences = user.preferences || {};
    user.preferences.subscription_tier = '';
  } else {
    user.plan = 'PRO';
    user.plan_expires_at = new Date(Date.now() + 30 * 24 * 3600 * 1000);
    user.preferences = user.preferences || {};
    user.preferences.subscription_tier = target;
  }

  await user.save();

  const amount = target === 'DEMO' ? 0 : target === 'CREATOR' ? 199000 : 499000;
  const evt = await SubscriptionMockEvent.create({
    user_id: userId,
    from_plan: fromTier,
    to_plan: target,
    target_label: target,
    amount_mock: amount,
    currency: 'VND',
    note: 'upgrade-mock'
  });

  return getSubscription(userId).then((sub) => ({
    ...sub,
    last_event: { _id: evt._id, to_plan: target, amount_mock: amount }
  }));
}

function defaultSettings() {
  return {
    preferences: {
      locale: 'vi',
      timezone: 'Asia/Ho_Chi_Minh',
      theme: 'system',
      privacy: { show_email: false, show_activity: true },
      location: { share_precise: true, default_radius_m: 1500 },
      subscription_tier: ''
    },
    notification_preferences: {
      email_security: true,
      email_product: true,
      in_app: true
    }
  };
}

async function getSettings(userId) {
  const user = await User.findById(userId)
    .select('preferences notification_preferences email full_name phone avatar')
    .lean();
  if (!user) throw badRequest('User không tồn tại.');
  const d = defaultSettings();
  return {
    preferences: {
      ...d.preferences,
      ...(user.preferences || {}),
      privacy: { ...d.preferences.privacy, ...(user.preferences?.privacy || {}) },
      location: { ...d.preferences.location, ...(user.preferences?.location || {}) }
    },
    notification_preferences: {
      ...d.notification_preferences,
      ...(user.notification_preferences || {})
    }
  };
}

async function updateSettings(userId, body = {}) {
  const user = await User.findById(userId);
  if (!user) throw badRequest('User không tồn tại.');

  const pref = body.preferences || {};
  user.preferences = user.preferences || {};
  if (pref.locale != null) user.preferences.locale = String(pref.locale).slice(0, 10);
  if (pref.timezone != null) user.preferences.timezone = String(pref.timezone).slice(0, 64);
  if (pref.theme != null && ['system', 'light', 'dark'].includes(pref.theme)) {
    user.preferences.theme = pref.theme;
  }
  if (pref.privacy && typeof pref.privacy === 'object') {
    user.preferences.privacy = {
      show_email: !!pref.privacy.show_email,
      show_activity: pref.privacy.show_activity !== false
    };
  }
  if (pref.location && typeof pref.location === 'object') {
    const r = Number(pref.location.default_radius_m);
    user.preferences.location = {
      share_precise: pref.location.share_precise !== false,
      default_radius_m: Number.isFinite(r) ? Math.min(20000, Math.max(100, r)) : 1500
    };
  }

  if (body.notification_preferences && typeof body.notification_preferences === 'object') {
    const np = body.notification_preferences;
    user.notification_preferences = user.notification_preferences || {};
    if (np.email_security != null) user.notification_preferences.email_security = !!np.email_security;
    if (np.email_product != null) user.notification_preferences.email_product = !!np.email_product;
    if (np.in_app != null) user.notification_preferences.in_app = !!np.in_app;
  }

  await user.save();
  return getSettings(userId);
}

async function createWorkspaceForUser(userId, body = {}) {
  const name = String(body.name || '').trim();
  if (!name) throw badRequest('Thiếu name workspace.');

  let place_id = body.place_id || null;
  let gps = body.gps_location || {};
  if (place_id) {
    if (!mongoose.Types.ObjectId.isValid(String(place_id))) {
      throw badRequest('place_id không hợp lệ.');
    }
    const place = await Place.findById(place_id).lean();
    if (!place) throw badRequest('Place không tồn tại.', 'PLACE_NOT_FOUND');
    if (!gps.lat && !gps.lng) {
      gps = { lat: place.latitude || 0, lng: place.longitude || 0 };
    }
  }

  const building = await Building.create({
    name,
    address: String(body.address || '').slice(0, 500),
    description: String(body.description || '').slice(0, 2000),
    gps_location: {
      lat: Number(gps.lat) || 0,
      lng: Number(gps.lng) || 0
    },
    place_id: place_id || null,
    status: 'DRAFT',
    workspace_status: WORKSPACE_STATUS.DRAFT,
    visibility: 'PRIVATE',
    total_floors: Math.max(1, parseInt(body.total_floors, 10) || 1),
    created_by: userId,
    owner_user_id: userId
  });

  return {
    workspace_id: building._id,
    _id: building._id,
    name: building.name,
    status: 'DRAFT',
    workspace_status: WORKSPACE_STATUS.DRAFT,
    building_id: building._id,
    source: 'building'
  };
}

module.exports = {
  getDashboard,
  getExplore,
  getActivities,
  getSubscription,
  upgradeMock,
  getSettings,
  updateSettings,
  createWorkspaceForUser,
  subscriptionDisplay
};
