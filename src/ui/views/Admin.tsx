import { useEcc } from '../../domain/store';
import { APPROVAL_LABEL, PROCESSING_LABEL, RELATION_LABEL, SOURCE_STATE_LABEL, type PlatformRole } from '../../domain/types';
import { useUi } from '../App';
import { SourceHealth } from '../components/Severity';
import { Tabs, TabPanel } from '../components/Tabs';
import { fmt, plural } from '../util';

type Section = 'overview' | 'users' | 'reference' | 'sources' | 'knowledge' | 'config' | 'audit';
const ROLES: PlatformRole[] = ['Incident user', 'Knowledge steward', 'Administrator', 'Observer'];

function Gate() {
  const ui = useUi();
  return (
    <p className="gate-note">
      Changes need the Administrator prototype role.{' '}
      <button type="button" className="link-btn" onClick={ui.openProfile}>
        Switch in User profile
      </button>
      . Simulated operations only.
    </p>
  );
}

export function Admin() {
  const { state, dispatch } = useEcc();
  const ui = useUi();
  const section = ui.ws.admin.section as Section;
  const setSection = (s: Section) => ui.setWs({ admin: { section: s } });
  const admin = state.prototypeRole === 'Administrator';
  const active = state.configs.find((c) => c.status === 'active');
  const limited = state.sources.filter((s) => s.state !== 'connected');
  const drafts = state.knowledge.filter((d) => d.revisions[0]?.approval === 'draft');

  return (
    <div className="page">
      <Tabs
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'users', label: 'Users and roles' },
          { id: 'reference', label: 'Reference data' },
          { id: 'sources', label: 'Sources', count: limited.length },
          { id: 'knowledge', label: 'Knowledge publishing', count: drafts.length },
          { id: 'config', label: 'Agent configuration' },
          { id: 'audit', label: 'Audit', count: state.audit.length },
        ]}
        active={section}
        onChange={setSection}
        label="Administration"
        aside={<span className="tag tag-proto">Simulated · prototype role: {state.prototypeRole}</span>}
      />

      {section === 'overview' && (
        <TabPanel id="overview">
          <div className="admin-grid">
            <button type="button" className="admin-tile" onClick={() => setSection('users')}>
              <span className="admin-tile-k">Users</span>
              <span className="admin-tile-v">{state.users.length}</span>
              <span className="admin-tile-s">{plural(state.users.filter((u) => u.platformRole === 'Administrator').length, 'administrator')}</span>
            </button>
            <button type="button" className="admin-tile" onClick={() => setSection('sources')}>
              <span className="admin-tile-k">Sources</span>
              <span className="admin-tile-v">{state.sources.length}</span>
              <span className="admin-tile-s">{limited.length ? `${plural(limited.length, 'source')} limited` : 'All connected'}</span>
            </button>
            <button type="button" className="admin-tile" onClick={() => setSection('knowledge')}>
              <span className="admin-tile-k">Knowledge</span>
              <span className="admin-tile-v">{state.knowledge.length}</span>
              <span className="admin-tile-s">{plural(drafts.length, 'revision')} not approved</span>
            </button>
            <button type="button" className="admin-tile" onClick={() => setSection('config')}>
              <span className="admin-tile-k">Agent configuration</span>
              <span className="admin-tile-v admin-tile-text">{active?.version ?? 'None active'}</span>
              <span className="admin-tile-s">{active?.activatedAt ? `Active since ${active.activatedAt}` : ''}</span>
            </button>
            <button type="button" className="admin-tile" onClick={() => setSection('audit')}>
              <span className="admin-tile-k">Audit entries</span>
              <span className="admin-tile-v">{state.audit.length}</span>
              <span className="admin-tile-s">This session</span>
            </button>
          </div>
          <div className="two-col">
            <section className="card" aria-labelledby="ad-att">
              <h3 id="ad-att">Needs attention</h3>
              {limited.length === 0 && drafts.length === 0 ? (
                <p className="muted small">Nothing outstanding.</p>
              ) : (
                <ul className="link-list">
                  {limited.map((s) => (
                    <li key={s.id}>
                      <button type="button" className="link-btn" onClick={() => setSection('sources')}>
                        {s.name}
                      </button>{' '}
                      <span className="muted">· {SOURCE_STATE_LABEL[s.state].toLowerCase()}</span>
                    </li>
                  ))}
                  {drafts.map((d) => (
                    <li key={d.id}>
                      <button type="button" className="link-btn" onClick={() => ui.openKnowledge(d.id, d.revisions[0].rev)}>
                        {d.docNumber} {d.revisions[0].rev}
                      </button>{' '}
                      <span className="muted">· {d.revisions[0].processing === 'failed' ? 'processing failed, cannot be published' : 'not approved'}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="field-label">Recent platform operations</div>
              {state.audit.length === 0 ? (
                <p className="muted small">None this session.</p>
              ) : (
                <ul className="link-list">
                  {state.audit
                    .slice(-4)
                    .reverse()
                    .map((a, i) => (
                      <li key={i}>
                        <span className="mono muted">{fmt(a.at)}</span> {a.action}: {a.target}
                      </li>
                    ))}
                </ul>
              )}
            </section>
            <section className="card" aria-labelledby="ad-ass">
              <h3 id="ad-ass">Assumptions in this prototype</h3>
              <ul className="bullet-list">
                <li>Every operation here is simulated. Nothing connects to a real system.</li>
                <li>Platform roles only show or hide controls. No permission model has been validated with the customer.</li>
                <li>Expected-report intervals, emergency policies and closure criteria are not defined and are not invented here.</li>
                <li>Activating an agent configuration applies from that moment. Recorded assessments keep the version they used.</li>
                <li>Knowledge publishing marks a revision effective in the library. It does not mean the agent has read or applied it.</li>
              </ul>
            </section>
          </div>
        </TabPanel>
      )}

      {section === 'users' && (
        <TabPanel id="users">
          {!admin && <Gate />}
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Job title</th>
                <th>Scope</th>
                <th>Platform role</th>
              </tr>
            </thead>
            <tbody>
              {state.users.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.jobTitle}</td>
                  <td>{u.scope}</td>
                  <td>
                    {admin ? (
                      <label className="inline-field">
                        <span className="sr-only">Platform role for {u.name}</span>
                        <select value={u.platformRole} onChange={(e) => dispatch({ type: 'ADMIN_SET_USER_ROLE', id: u.id, role: e.target.value as PlatformRole })}>
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      u.platformRole
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">Platform roles control which platform features are shown. They are not incident roles and assign no responsibility. Your own prototype role is set in User profile and is not in this table.</p>
        </TabPanel>
      )}

      {section === 'reference' && (
        <TabPanel id="reference">
          <p className="muted small">Facility, area and equipment reference as the agent holds it for this incident. Read only in the prototype.</p>
          <table className="table">
            <thead>
              <tr>
                <th>Tag</th>
                <th>Name</th>
                <th>Type</th>
                <th>Area</th>
                <th>In this incident</th>
              </tr>
            </thead>
            <tbody>
              {state.assets.map((a) => (
                <tr key={a.id}>
                  <td className="mono">{a.tag}</td>
                  <td>{a.name}</td>
                  <td>{a.assetType === 'area' ? 'Area' : 'Equipment'}</td>
                  <td>{a.area}</td>
                  <td>{a.identified ? RELATION_LABEL[a.relation] : <span className="muted">Not identified</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TabPanel>
      )}

      {section === 'sources' && (
        <TabPanel id="sources">
          {!admin && <Gate />}
          <table className="table">
            <thead>
              <tr>
                <th>Source</th>
                <th>State</th>
                <th>Last successful update</th>
                <th>Effect on the brief</th>
                {admin && <th>Test</th>}
              </tr>
            </thead>
            <tbody>
              {state.sources.map((s) => (
                <tr key={s.id} className={`src-${s.state}`}>
                  <td>
                    <div>{s.name}</div>
                    <div className="muted small">{s.description}</div>
                  </td>
                  <td>
                    <SourceHealth state={s.state} size="sm" />
                  </td>
                  <td className="t-num">{s.lastSuccess === null ? 'None' : fmt(s.lastSuccess)}</td>
                  <td>{s.effect ?? <span className="muted">None</span>}</td>
                  {admin && (
                    <td>
                      <button type="button" className="btn btn-sm" onClick={() => dispatch({ type: 'ADMIN_TEST_SOURCE', id: s.id })}>
                        Test (simulated)
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">A test reports the simulated state of the connection. It does not retry retrievals or change the brief.</p>
        </TabPanel>
      )}

      {section === 'knowledge' && (
        <TabPanel id="knowledge">
          <p className="muted small">Publishing happens in the Knowledge workspace and needs the Knowledge steward or Administrator prototype role. This list shows what is waiting.</p>
          <table className="table">
            <thead>
              <tr>
                <th>Document</th>
                <th>Latest revision</th>
                <th>Processing</th>
                <th>Approval</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {state.knowledge.map((d) => {
                const r = d.revisions[0];
                return (
                  <tr key={d.id}>
                    <td>
                      <div>{d.title}</div>
                      <div className="muted small mono">{d.docNumber}</div>
                    </td>
                    <td>{r.rev}</td>
                    <td>{PROCESSING_LABEL[r.processing]}</td>
                    <td>
                      <span className={`tag tag-${r.approval}`}>{APPROVAL_LABEL[r.approval]}</span>
                    </td>
                    <td>
                      <button type="button" className="link-btn" onClick={() => ui.openKnowledge(d.id, r.rev)}>
                        Open in Knowledge
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TabPanel>
      )}

      {section === 'config' && (
        <TabPanel id="config">
          {!admin && <Gate />}
          <table className="table">
            <thead>
              <tr>
                <th>Version</th>
                <th>Status</th>
                <th>Notes</th>
                <th>Activated</th>
                {admin && <th></th>}
              </tr>
            </thead>
            <tbody>
              {state.configs.map((c) => (
                <tr key={c.version} className={c.status === 'active' ? 'is-active' : ''}>
                  <td className="mono">{c.version}</td>
                  <td>
                    <span className={`tag ${c.status === 'active' ? 'tag-effective' : ''}`}>{c.status === 'active' ? 'Active' : c.status === 'draft' ? 'Draft' : 'Retired'}</span>
                  </td>
                  <td>{c.notes}</td>
                  <td>{c.activatedAt ?? <span className="muted">—</span>}</td>
                  {admin && (
                    <td>
                      {c.status !== 'active' && (
                        <button type="button" className="btn btn-sm" onClick={() => dispatch({ type: 'ADMIN_ACTIVATE_CONFIG', version: c.version })}>
                          Activate (simulated)
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">Activating a version applies from now on. Execution records and assessments already recorded keep the version they used; nothing is reassessed retroactively.</p>
        </TabPanel>
      )}

      {section === 'audit' && (
        <TabPanel id="audit">
          {state.audit.length === 0 ? (
            <div className="empty-block">
              <p className="empty-title">No audit entries yet</p>
              <p>Publishing a revision, changing a role, activating a configuration or testing a source adds an entry here.</p>
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Target</th>
                </tr>
              </thead>
              <tbody>
                {state.audit
                  .slice()
                  .reverse()
                  .map((a, i) => (
                    <tr key={i}>
                      <td className="t-num">{fmt(a.at)}</td>
                      <td>{a.actor}</td>
                      <td>{a.action}</td>
                      <td>{a.target}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
          <p className="muted small">Audit entries record platform operations. Incident decisions and reports are on the incident record, not here.</p>
        </TabPanel>
      )}
    </div>
  );
}
