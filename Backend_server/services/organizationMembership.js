function legacyMemberFromUser(user) {
  if (!user || !user.organization_id || !['ORG_ADMIN', 'BUILDING_ADMIN'].includes(user.role)) {
    return null;
  }
  return {
    organization_id: user.organization_id,
    user_id: user._id,
    role: user.role,
    building_ids: user.assigned_buildings || [],
    department_id: null,
    status: user.is_active === false ? 'SUSPENDED' : 'ACTIVE',
    source: 'legacy_user'
  };
}

function effectiveMember(member, user) {
  if (member && member.status !== 'LEFT') {
    return { ...member, source: 'organization_member' };
  }
  return legacyMemberFromUser(user);
}

async function findEffectiveMember({ OrganizationMember, User, userId, organizationId }) {
  const [member, user] = await Promise.all([
    OrganizationMember.findOne({
      user_id: userId,
      organization_id: organizationId,
      status: { $ne: 'LEFT' }
    }).lean(),
    User.findById(userId)
      .select('organization_id role assigned_buildings is_active')
      .lean()
  ]);
  return effectiveMember(member, user);
}

module.exports = { legacyMemberFromUser, effectiveMember, findEffectiveMember };
