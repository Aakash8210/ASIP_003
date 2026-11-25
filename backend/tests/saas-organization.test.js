import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { randomUUID } from 'node:crypto';

process.env.NODE_ENV = 'test';
process.env.MONGODB_DB_NAME = 'interview_monitoring_saas_test';
process.env.JWT_SECRET = 'phase24-saas-test-secret';

const TEST_DB_NAME = 'interview_monitoring_saas_test';

const { default: app } = await import('../src/app.js');
const { connectDatabase, closeDatabase, getDatabaseName } = await import('../src/config/database.js');
const { ensureBaselineIndexes } = await import('../src/db/indexes.js');
const { COLLECTIONS } = await import('../src/db/collections.js');
const { signToken } = await import('../src/auth/tokens.js');
const { PLAN_TIERS, MEMBER_ROLES, AUDIT_ACTIONS } = await import('../src/organizations/organizationConstants.js');

let httpServer;
let port;

const makeRequest = (path, { method = 'GET', body, token, origin = 'http://localhost:5180' } = {}) => {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = {
      'Content-Type': 'application/json',
      Origin: origin,
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    if (payload) {
      headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          try {
            const parsed = raw ? JSON.parse(raw) : null;
            resolve({ statusCode: res.statusCode, headers: res.headers, body: parsed });
          } catch (e) {
            resolve({ statusCode: res.statusCode, headers: res.headers, raw });
          }
        });
      }
    );

    req.on('error', reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
};

describe('Phase 24 — SaaS Productization & Enterprise Scale Test Suite', () => {
  let db;
  let hrUser;
  let hrToken;
  let candidateUser;
  let candidateToken;
  let secondUser;
  let secondToken;

  before(async () => {
    db = await connectDatabase();
    await ensureBaselineIndexes(db);

    // Clean test DB
    await db.collection(COLLECTIONS.ORGANIZATIONS).deleteMany({});
    await db.collection(COLLECTIONS.AUDIT_LOGS).deleteMany({});
    await db.collection(COLLECTIONS.USERS).deleteMany({});
    await db.collection(COLLECTIONS.RECRUITERS).deleteMany({});
    await db.collection(COLLECTIONS.EVIDENCE).deleteMany({});
    await db.collection(COLLECTIONS.MONITORING_EVENTS).deleteMany({});

    // Start HTTP server
    await new Promise((resolve) => {
      httpServer = http.createServer(app);
      httpServer.listen(0, '127.0.0.1', () => {
        port = httpServer.address().port;
        resolve();
      });
    });

    // Create test HR user
    hrUser = {
      _id: randomUUID(),
      email: `hr-${Date.now()}@acme.corp`,
      name: 'Sarah Connor',
      role: 'recruiter',
      created_at: new Date(),
    };
    await db.collection(COLLECTIONS.USERS).insertOne(hrUser);
    await db.collection(COLLECTIONS.RECRUITERS).insertOne({
      _id: randomUUID(),
      user_id: hrUser._id,
      company: 'Acme Robotics',
      created_at: new Date(),
    });
    hrToken = signToken({
      sub: hrUser._id,
      email: hrUser.email,
      role: hrUser.role,
      name: hrUser.name,
    });

    // Create test candidate user
    candidateUser = {
      _id: randomUUID(),
      email: `cand-${Date.now()}@example.com`,
      name: 'John Connor',
      role: 'candidate',
      created_at: new Date(),
    };
    await db.collection(COLLECTIONS.USERS).insertOne(candidateUser);
    candidateToken = signToken({
      sub: candidateUser._id,
      email: candidateUser.email,
      role: candidateUser.role,
      name: candidateUser.name,
    });

    // Create a second HR user for multi-tenant isolation testing
    secondUser = {
      _id: randomUUID(),
      email: `hr2-${Date.now()}@cyberdyne.corp`,
      name: 'Miles Dyson',
      role: 'recruiter',
      created_at: new Date(),
    };
    await db.collection(COLLECTIONS.USERS).insertOne(secondUser);
    await db.collection(COLLECTIONS.RECRUITERS).insertOne({
      _id: randomUUID(),
      user_id: secondUser._id,
      company: 'Cyberdyne Systems',
      created_at: new Date(),
    });
    secondToken = signToken({
      sub: secondUser._id,
      email: secondUser.email,
      role: secondUser.role,
      name: secondUser.name,
    });
  });

  after(async () => {
    if (httpServer) {
      await new Promise((resolve) => httpServer.close(resolve));
    }
    if (db) {
      await db.collection(COLLECTIONS.ORGANIZATIONS).deleteMany({});
      await db.collection(COLLECTIONS.AUDIT_LOGS).deleteMany({});
      await db.collection(COLLECTIONS.USERS).deleteMany({});
      await db.collection(COLLECTIONS.RECRUITERS).deleteMany({});
      await db.collection(COLLECTIONS.EVIDENCE).deleteMany({});
      await db.collection(COLLECTIONS.MONITORING_EVENTS).deleteMany({});
      await closeDatabase();
    }
  });

  describe('RBAC & Route Protection', () => {
    it('returns 401 Unauthorized when no token is provided', async () => {
      const res = await makeRequest('/api/organization');
      assert.strictEqual(res.statusCode, 401);
    });

    it('returns 403 Forbidden when candidate role calls organization endpoint', async () => {
      const res = await makeRequest('/api/organization', { token: candidateToken });
      assert.strictEqual(res.statusCode, 403);
      assert.match(res.body.message || '', /permission/i);
    });
  });

  describe('Organization Lifecycle & Multi-Tenant Provisioning', () => {
    it('provisions a default organization on first HR access with default entitlements', async () => {
      const res = await makeRequest('/api/organization', { token: hrToken });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'ok');

      const org = res.body.organization;
      assert.ok(org.organization_id);
      assert.strictEqual(org.name, 'Acme Robotics');
      assert.strictEqual(org.plan_tier, PLAN_TIERS.GROWTH);
      assert.ok(org.entitlements);
      assert.strictEqual(org.entitlements.max_active_interviews, 100);
      assert.strictEqual(org.entitlements.max_members, 25);
      assert.strictEqual(org.entitlements.v2_multimodal_enabled, true);

      // Check founder member
      assert.strictEqual(org.members.length, 1);
      assert.strictEqual(org.members[0].user_id, hrUser._id);
      assert.strictEqual(org.members[0].role, MEMBER_ROLES.HR_ADMIN);
    });

    it('provisions isolated organization for a different user tenant', async () => {
      const res1 = await makeRequest('/api/organization', { token: hrToken });
      const res2 = await makeRequest('/api/organization', { token: secondToken });

      assert.strictEqual(res1.statusCode, 200);
      assert.strictEqual(res2.statusCode, 200);
      assert.notStrictEqual(res1.body.organization.organization_id, res2.body.organization.organization_id);
      assert.strictEqual(res2.body.organization.name, 'Cyberdyne Systems');
    });

    it('updates organization name and upgrades plan tier to ENTERPRISE', async () => {
      const res = await makeRequest('/api/organization', {
        method: 'PATCH',
        token: hrToken,
        body: {
          name: 'Acme Robotics Global Inc.',
          plan_tier: PLAN_TIERS.ENTERPRISE,
        },
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.organization.name, 'Acme Robotics Global Inc.');
      assert.strictEqual(res.body.organization.plan_tier, PLAN_TIERS.ENTERPRISE);
      assert.strictEqual(res.body.organization.entitlements.max_members, 250);
      assert.strictEqual(res.body.organization.entitlements.max_retention_days, 365);
      assert.strictEqual(res.body.organization.entitlements.support_tier, 'dedicated_sla');
    });
  });

  describe('Team Member Roster & Role Governance', () => {
    let invitedUserId;

    it('retrieves the organization member roster', async () => {
      const res = await makeRequest('/api/organization/members', { token: hrToken });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'ok');
      assert.strictEqual(res.body.total_members, 1);
      assert.strictEqual(res.body.max_members, 250);
    });

    it('invites a new team member to the organization', async () => {
      const res = await makeRequest('/api/organization/members', {
        method: 'POST',
        token: hrToken,
        body: {
          email: 'kyle.reese@acme.corp',
          name: 'Kyle Reese',
          role: MEMBER_ROLES.INTERVIEWER,
        },
      });

      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(res.body.status, 'ok');
      assert.ok(res.body.member);
      assert.strictEqual(res.body.member.name, 'Kyle Reese');
      assert.strictEqual(res.body.member.role, MEMBER_ROLES.INTERVIEWER);
      invitedUserId = res.body.member.user_id;

      // Verify organization has 2 members
      assert.strictEqual(res.body.organization.members.length, 2);
    });

    it('rejects duplicate member invite for the same email in organization', async () => {
      const res = await makeRequest('/api/organization/members', {
        method: 'POST',
        token: hrToken,
        body: {
          email: 'kyle.reese@acme.corp',
          name: 'Kyle Reese',
          role: MEMBER_ROLES.INTERVIEWER,
        },
      });

      assert.strictEqual(res.statusCode, 409);
      assert.match(res.body.message || '', /already a member/i);
    });

    it('updates member role to RECRUITER', async () => {
      const res = await makeRequest(`/api/organization/members/${invitedUserId}`, {
        method: 'PATCH',
        token: hrToken,
        body: {
          role: MEMBER_ROLES.RECRUITER,
        },
      });

      assert.strictEqual(res.statusCode, 200);
      const updatedMember = res.body.organization.members.find((m) => m.user_id === invitedUserId);
      assert.strictEqual(updatedMember.role, MEMBER_ROLES.RECRUITER);
    });

    it('rejects removing the sole HR Admin of the organization', async () => {
      const res = await makeRequest(`/api/organization/members/${hrUser._id}`, {
        method: 'DELETE',
        token: hrToken,
      });

      assert.strictEqual(res.statusCode, 400);
      assert.match(res.body.message || '', /Cannot remove the sole HR Admin/i);
    });

    it('removes invited member from the organization roster', async () => {
      const res = await makeRequest(`/api/organization/members/${invitedUserId}`, {
        method: 'DELETE',
        token: hrToken,
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.organization.members.length, 1);
      assert.ok(!res.body.organization.members.some((m) => m.user_id === invitedUserId));
    });
  });

  describe('Plan Entitlements & Member Limit Enforcement', () => {
    it('enforces member cap when plan limit is reached', async () => {
      try {
        // Downgrade to STARTER (limit 5 members)
        await makeRequest('/api/organization', {
          method: 'PATCH',
          token: hrToken,
          body: {
            plan_tier: PLAN_TIERS.STARTER,
          },
        });

        // Member 1 is hrUser. Add 4 more to hit the 5 member cap
        for (let i = 2; i <= 5; i++) {
          const res = await makeRequest('/api/organization/members', {
            method: 'POST',
            token: hrToken,
            body: { email: `member${i}@acme.corp`, name: `Member ${i}`, role: MEMBER_ROLES.INTERVIEWER },
          });
          assert.strictEqual(res.statusCode, 201);
        }

        // Add 6th member (should be rejected because limit is 5)
        const res6 = await makeRequest('/api/organization/members', {
          method: 'POST',
          token: hrToken,
          body: { email: 'member6@acme.corp', name: 'Member Six', role: MEMBER_ROLES.INTERVIEWER },
        });
        assert.strictEqual(res6.statusCode, 409);
        assert.match(res6.body.message || '', /plan limit of 5 members/i);
      } finally {
        // Always reset back to ENTERPRISE for subsequent tests
        await makeRequest('/api/organization', {
          method: 'PATCH',
          token: hrToken,
          body: { plan_tier: PLAN_TIERS.ENTERPRISE },
        });
      }
    });
  });

  describe('Data Retention Governance & Manual Purge', () => {
    it('retrieves and updates data retention policies and webhook config', async () => {
      const getRes = await makeRequest('/api/organization/governance', { token: hrToken });
      assert.strictEqual(getRes.statusCode, 200);
      assert.ok(getRes.body.governance);
      assert.ok(getRes.body.webhook_config);

      const patchRes = await makeRequest('/api/organization/governance', {
        method: 'PATCH',
        token: hrToken,
        body: {
          governance: {
            evidence_retention_days: 14,
            events_retention_days: 60,
            auto_purge_enabled: true,
          },
          webhook_config: {
            url: 'https://webhook.site/acme-test',
            secret: 'test-secret-key-12345',
            events: ['interview.completed', 'integrity.alert'],
            enabled: true,
          },
        },
      });

      assert.strictEqual(patchRes.statusCode, 200);
      assert.strictEqual(patchRes.body.governance.evidence_retention_days, 14);
      assert.strictEqual(patchRes.body.governance.events_retention_days, 60);
      assert.strictEqual(patchRes.body.webhook_config.enabled, true);
    });

    it('purges expired evidence and historical monitoring events correctly', async () => {
      const orgRes = await makeRequest('/api/organization', { token: hrToken });
      const orgId = orgRes.body.organization.organization_id;

      // Seed expired evidence (past cutoff date)
      const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

      await db.collection(COLLECTIONS.EVIDENCE).insertMany([
        {
          _id: randomUUID(),
          evidence_id: randomUUID(),
          organization_id: orgId,
          captured_at: sixtyDaysAgo,
          file_name: 'expired_frame.jpg',
        },
        {
          _id: randomUUID(),
          evidence_id: randomUUID(),
          organization_id: orgId,
          captured_at: yesterday, // fresh
          file_name: 'fresh_frame.jpg',
        },
      ]);

      // Seed expired monitoring event (older than 60 days)
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      await db.collection(COLLECTIONS.MONITORING_EVENTS).insertMany([
        {
          _id: randomUUID(),
          organization_id: orgId,
          created_at: ninetyDaysAgo,
          event_type: 'GAZE_AWAY',
        },
        {
          _id: randomUUID(),
          organization_id: orgId,
          created_at: yesterday, // fresh
          event_type: 'MULTIPLE_FACES',
        },
      ]);

      const purgeRes = await makeRequest('/api/organization/governance/purge-expired', {
        method: 'POST',
        token: hrToken,
      });

      assert.strictEqual(purgeRes.statusCode, 200);
      assert.strictEqual(purgeRes.body.status, 'ok');
      assert.strictEqual(purgeRes.body.purged_evidence_count, 1);
      assert.strictEqual(purgeRes.body.purged_events_count, 1);

      // Verify remaining counts
      const remainingEvidence = await db.collection(COLLECTIONS.EVIDENCE).countDocuments({ organization_id: orgId });
      assert.strictEqual(remainingEvidence, 1);

      const remainingEvents = await db.collection(COLLECTIONS.MONITORING_EVENTS).countDocuments({ organization_id: orgId });
      assert.strictEqual(remainingEvents, 1);
    });
  });

  describe('Webhook HMAC Signing & Test Emitter', () => {
    it('emits test webhook event with valid HMAC-SHA256 signature', async () => {
      const res = await makeRequest('/api/organization/webhooks/test', {
        method: 'POST',
        token: hrToken,
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'ok');
      assert.strictEqual(res.body.event, 'interview.test_ping');
      assert.ok(res.body.signature_header);
      assert.ok(res.body.signature_header.startsWith('sha256='));
    });
  });

  describe('Enterprise Audit Trail', () => {
    it('records immutable audit logs for all administrative actions and retrieves them', async () => {
      const res = await makeRequest('/api/organization/audit-log', { token: hrToken });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'ok');
      assert.ok(Array.isArray(res.body.logs));
      assert.ok(res.body.pagination.total >= 4);

      const actions = res.body.logs.map((l) => l.action);
      assert.ok(actions.includes(AUDIT_ACTIONS.MEMBER_INVITED));
      assert.ok(actions.includes(AUDIT_ACTIONS.MEMBER_ROLE_UPDATED));
      assert.ok(actions.includes(AUDIT_ACTIONS.MEMBER_REMOVED));
      assert.ok(actions.includes(AUDIT_ACTIONS.RETENTION_PURGE_TRIGGERED));
      assert.ok(actions.includes(AUDIT_ACTIONS.GOVERNANCE_UPDATED) || actions.includes(AUDIT_ACTIONS.WEBHOOK_CONFIGURED));

      // Check first log entry structure
      const entry = res.body.logs[0];
      assert.ok(entry.log_id);
      assert.ok(entry.organization_id);
      assert.ok(entry.actor_id);
      assert.ok(entry.created_at);
    });
  });
});
