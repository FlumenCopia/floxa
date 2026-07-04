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

export default function ProjectSection() {
  return (
    <div className="content">
      <div className="screen active">
        <div className="project-page-head">
          <h1 className="project-page-title">12 projects</h1>
          <div className="project-page-actions">
            <button className="btn btn-secondary project-filter-btn" type="button">
              All statuses
            </button>
            <button className="btn btn-primary project-new-btn" type="button">
              + New
            </button>
          </div>
        </div>

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
                {projectRows.map((row) => (
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
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
