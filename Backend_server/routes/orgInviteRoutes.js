// B5 — Routes lời mời thành viên tổ chức
const express = require('express');
const router = express.Router();
const {
  postInvite,
  getInvites,
  postRevoke,
  getAcceptPreview,
  postAccept
} = require('../controllers/orgInviteController');
const { auth, requirePermission } = require('../middlewares/auth');
const { P } = require('../utils/permissions');

// Preview token — không cần đăng nhập
router.get('/accept', getAcceptPreview);

router.use(auth);

router.post('/accept', postAccept);
router.post('/', requirePermission(P.ORG_USERS_MANAGE), postInvite);
router.get('/', requirePermission(P.ORG_USERS_MANAGE), getInvites);
router.post('/:id/revoke', requirePermission(P.ORG_USERS_MANAGE), postRevoke);

module.exports = router;
