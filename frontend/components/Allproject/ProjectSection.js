 "use client";

import { useMemo, useState } from "react";

const projectRows = [
  {
    client: "Craft & Co",
    email: "craft@company.com",
    sector: "Consumer Goods",
    status: "Discovery",
    statusClass: "badge-amber",
    value: "Rs50,000",
    progress: 45,
    created: "Jun 1",
  },
  {
    client: "Bloom Studio",
    email: "hello@bloom.in",
    sector: "Beauty & Wellness",
    status: "Advance Paid",
    statusClass: "badge-green",
    value: "Rs75,000",
    progress: 60,
    created: "May 28",
  },
  {
    client: "Helix Tech",
    email: "brand@helixtech.io",
    sector: "Technology",
    status: "Concepts",
    statusClass: "badge-blue",
    value: "Rs1,20,000",
    progress: 80,
    created: "May 20",
  },
  {
    client: "Luna Spa",
    email: "connect@lunaspa.in",
    sector: "Wellness",
    status: "Delivered",
    statusClass: "badge-green",
    value: "Rs60,000",
    progress: 100,
    created: "May 10",
  },
  {
    client: "Aether Foods",
    email: "brand@aether.co",
    sector: "Food & Beverage",
    status: "Created",
    statusClass: "badge-muted",
    value: "Rs40,000",
    progress: 8,
    created: "Jun 3",
  },
];

const statusOptions = ["All statuses", "Discovery", "Advance Paid", "Concepts", "Delivered", "Created"];

export default function ProjectSection() {
  const [selectedStatus, setSelectedStatus] = useState("All statuses");
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [isNewOpen, setIsNewOpen] = useState(false);

  const filteredProjects = useMemo(() => {
    if (selectedStatus === "All statuses") {
      return projectRows;
    }

    return projectRows.filter((row) => row.status === selectedStatus);
  }, [selectedStatus]);

  return (
    <div className="content">
      <div className="screen active">
        <div className="project-page-head">
          <h1 className="project-page-title">{filteredProjects.length} projects</h1>
          <div className="project-page-actions">
            <div className={`project-filter-wrap ${isStatusOpen ? "open" : ""}`.trim()}>
              <button
                className="btn btn-secondary project-filter-btn"
                type="button"
                onClick={() => setIsStatusOpen((open) => !open)}
              >
                {selectedStatus}
                <span className="project-filter-caret">{isStatusOpen ? "^" : "v"}</span>
              </button>

              {isStatusOpen ? (
                <div className="project-filter-menu">
                  {statusOptions.map((status) => (
                    <button
                      key={status}
                      className={`project-filter-option ${selectedStatus === status ? "active" : ""}`.trim()}
                      type="button"
                      onClick={() => {
                        setSelectedStatus(status);
                        setIsStatusOpen(false);
                      }}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <button className="btn btn-primary project-new-btn" type="button" onClick={() => setIsNewOpen((open) => !open)}>
              + New
            </button>
          </div>
        </div>

        {isNewOpen ? (
          <div className="project-create-card">
            <div className="project-create-head">
              <div className="project-create-title">New Project</div>
              <button className="project-create-close" type="button" onClick={() => setIsNewOpen(false)}>
                Close
              </button>
            </div>

            <div className="project-create-grid">
              <div className="form-group">
                <label className="form-label">Client Name</label>
                <input className="form-input" type="text" placeholder="Craft & Co" />
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input className="form-input" type="email" placeholder="hello@client.com" />
              </div>
              <div className="form-group">
                <label className="form-label">Sector</label>
                <input className="form-input" type="text" placeholder="Consumer Goods" />
              </div>
              <div className="form-group">
                <label className="form-label">Status</label>
                <select className="form-input" defaultValue="Discovery">
                  {statusOptions.slice(1).map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="project-create-actions">
              <button className="btn btn-secondary" type="button" onClick={() => setIsNewOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" type="button">
                Create Project
              </button>
            </div>
          </div>
        ) : null}

        <div className="project-table-card">
          <div className="project-table-wrap">
            <table className="project-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Sector</th>
                  <th>Status</th>
                  <th>Value</th>
                  <th>Progress</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {filteredProjects.map((row) => (
                  <tr key={row.client}>
                    <td>
                      <div className="project-client-name">{row.client}</div>
                      <div className="project-client-email">{row.email}</div>
                    </td>
                    <td>{row.sector}</td>
                    <td>
                      <span className={`badge ${row.statusClass}`}>{row.status}</span>
                    </td>
                    <td className="project-value">{row.value}</td>
                    <td>
                      <div className="project-progress-cell">
                        <div className="project-progress-track">
                          <div className="project-progress-fill" style={{ width: `${row.progress}%` }} />
                        </div>
                      </div>
                    </td>
                    <td>{row.created}</td>
                  </tr>
                ))}
                {filteredProjects.length === 0 ? (
                  <tr>
                    <td className="project-empty-state" colSpan="6">
                      No projects found for this status.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
