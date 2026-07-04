const stats = [
  { label: "Active Projects", value: "12", change: "+ 3 this month", icon: "project", deltaClass: "up" },
  { label: "Revenue This Month", value: "Rs 2.4L", change: "+ 18% vs last month", icon: "revenue", deltaClass: "up" },
  { label: "AI Adoption Rate", value: "68%", change: "+ 12% since Q1", icon: "ai", deltaClass: "up" },
  { label: "Avg Completion", value: "72%", change: "- 4% - 2 stalled", icon: "completion", deltaClass: "down" },
];

const pipelineRows = [
  { client: "Craft & Co", sector: "Consumer Goods", stage: "Discovery", stageClass: "badge-amber", progress: 45 },
  { client: "Bloom Studio", sector: "Beauty", stage: "Advance Paid", stageClass: "badge-green", progress: 60 },
  { client: "Helix Tech", sector: "Technology", stage: "Concepts", stageClass: "badge-blue", progress: 80 },
  { client: "Luna Spa", sector: "Wellness", stage: "Delivered", stageClass: "badge-green", progress: 100 },
];

const todayActivity = [
  {
    avatar: "NB",
    avatarClass: "client",
    title: "Nova Brands selected Moodboard 2 for Craft & Co",
    time: "2 min ago",
  },
  {
    avatar: "Rs",
    avatarClass: "system",
    title: "Rs 25,000 advance payment received from Bloom Studio",
    time: "1 hr ago",
  },
  {
    avatar: "AK",
    avatarClass: "consultant",
    title: "You uploaded 3 concepts for Helix Tech",
    time: "3 hrs ago",
  },
];

const yesterdayActivity = [
  {
    avatar: "LS",
    avatarClass: "client",
    title: "Luna Spa completed discovery - Brand DNA generated",
    time: "Jun 2, 4:22 PM",
  },
];

function KpiIcon({ type }) {
  const commonProps = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
  };

  switch (type) {
    case "revenue":
      return (
        <svg {...commonProps}>
          <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      );
    case "ai":
      return (
        <svg {...commonProps}>
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      );
    case "completion":
      return (
        <svg {...commonProps}>
          <path d="M12 6v6l4 2" />
          <circle cx="12" cy="12" r="9" />
        </svg>
      );
    default:
      return (
        <svg {...commonProps}>
          <path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
        </svg>
      );
  }
}

export default function Dashboardsection() {
  return (
    <div className="content">
      <div className="screen active" id="screen-dashboard">
        <div className="kpi-grid">
          {stats.map((item) => (
            <div className="kpi-card" key={item.label}>
              <div className="kpi-card-header">
                <div className="kpi-label">{item.label}</div>
                <div className="kpi-icon">
                  <KpiIcon type={item.icon} />
                </div>
              </div>
              <div className="kpi-value">{item.value}</div>
              <div className={`kpi-delta ${item.deltaClass}`}>{item.change}</div>
            </div>
          ))}
        </div>

        <div className="dashboard-grid">
          <div className="card dashboard-card">
            <div className="row-sb dashboard-card-header">
              <div className="font-6 dashboard-card-title">Recent projects</div>
              <div className="dashboard-card-actions">
                <button className="btn btn-secondary dashboard-outline-btn" type="button">
                  View all
                </button>
                <button className="btn btn-primary dashboard-solid-btn" type="button">
                  + New
                </button>
              </div>
            </div>
            <div className="table-wrap dashboard-table-wrap">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Status</th>
                    <th>Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {pipelineRows.map((row) => (
                    <tr key={row.client}>
                      <td>
                        <div className="font-6 dash-client-name">{row.client}</div>
                        <div className="dash-client-sector">{row.sector}</div>
                      </td>
                      <td>
                        <span className={`badge ${row.stageClass}`}>{row.stage}</span>
                      </td>
                      <td>
                        <div className="progress-cell">
                          <div className="progress-track">
                            <div className="progress-fill" style={{ width: `${row.progress}%` }} />
                          </div>
                          <span className="progress-value">{row.progress}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card dashboard-card activity-card">
            <div className="row-sb dashboard-card-header">
              <div className="font-6 dashboard-card-title">Recent activity</div>
            </div>
            <div className="activity-date">Today</div>
            {todayActivity.map((item) => (
              <div className="activity-item" key={item.title}>
                <div className={`act-av ${item.avatarClass}`}>{item.avatar}</div>
                <div>
                  <div className="act-action">{item.title}</div>
                  <div className="act-time">{item.time}</div>
                </div>
              </div>
            ))}
            <div className="activity-date">Yesterday</div>
            {yesterdayActivity.map((item) => (
              <div className="activity-item" key={item.title}>
                <div className={`act-av ${item.avatarClass}`}>{item.avatar}</div>
                <div>
                  <div className="act-action">{item.title}</div>
                  <div className="act-time">{item.time}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card2 quick-actions dashboard-quick-actions">
          <span className="text-sm text-muted">Quick actions:</span>
          <button className="btn btn-secondary btn-sm dashboard-chip-btn" type="button">
            + New project
          </button>
          <button className="btn btn-secondary btn-sm dashboard-chip-btn" type="button">
            Copy last client link
          </button>
          <button className="btn btn-secondary btn-sm dashboard-chip-btn" type="button">
            AI Suite
          </button>
          <button className="btn btn-secondary btn-sm dashboard-chip-btn" type="button">
            Analytics
          </button>
        </div>
      </div>
    </div>
  );
}
