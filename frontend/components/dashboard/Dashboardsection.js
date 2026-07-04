const stats = [
  { label: "Active Projects", value: "12", change: "+ 3 this month", icon: "project" },
  { label: "Revenue This Month", value: "Rs 2.4L", change: "+ 18% vs last month", icon: "revenue" },
  { label: "AI Adoption Rate", value: "68%", change: "+ 12% since Q1", icon: "ai" },
  { label: "Pending Reviews", value: "07", change: "+ 2 need approval", icon: "review" },
];

const pipelineRows = [
  { client: "Craft & Co", sector: "Consumer", stage: "Discovery", stageClass: "badge-amber", progress: "35%" },
  { client: "Nova Brands", sector: "Retail", stage: "Advance Paid", stageClass: "badge-green", progress: "60%" },
  { client: "Helix Tech", sector: "Technology", stage: "Concepts", stageClass: "badge-blue", progress: "80%" },
  { client: "Luna Spa", sector: "Wellness", stage: "Delivered", stageClass: "badge-green", progress: "100%" },
];

const activityFeed = [
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
    case "review":
      return (
        <svg {...commonProps}>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
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
              <div className="kpi-label">{item.label}</div>
              <div className="kpi-value">{item.value}</div>
              <div className="kpi-delta up">{item.change}</div>
              <div className="kpi-icon">
                <KpiIcon type={item.icon} />
              </div>
            </div>
          ))}
        </div>

        <div className="grid-2">
          <div className="card">
            <div className="row-sb mb-3">
              <div className="font-6 text-base">Project pipeline</div>
              <span className="badge badge-green">4 live accounts</span>
            </div>
            <div className="table-wrap">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Stage</th>
                    <th>Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {pipelineRows.map((row) => (
                    <tr key={row.client}>
                      <td>
                        <div className="font-5">{row.client}</div>
                        <div className="text-xs text-dim">{row.sector}</div>
                      </td>
                      <td>
                        <span className={`badge ${row.stageClass}`}>{row.stage}</span>
                      </td>
                      <td>{row.progress}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card" style={{ overflowY: "auto", maxHeight: "320px" }}>
            <div className="row-sb mb-3">
              <div className="font-6 text-base">Recent activity</div>
            </div>
            <div className="activity-date">Today</div>
            {activityFeed.map((item) => (
              <div className="activity-item" key={item.title}>
                <div className={`act-av ${item.avatarClass}`}>{item.avatar}</div>
                <div>
                  <div className="act-action">{item.title}</div>
                  <div className="act-time">{item.time}</div>
                </div>
              </div>
            ))}
            <div className="activity-date">Yesterday</div>
            <div className="activity-item">
              <div className="act-av client">LS</div>
              <div>
                <div className="act-action">Luna Spa completed discovery - Brand DNA generated</div>
                <div className="act-time">Jun 2, 4:22 PM</div>
              </div>
            </div>
          </div>
        </div>

        <div className="card2 quick-actions" style={{ marginTop: "14px" }}>
          <span className="text-sm text-muted">Quick actions:</span>
          <button className="btn btn-secondary btn-sm" type="button">
            + New project
          </button>
          <button className="btn btn-secondary btn-sm" type="button">
            Copy last client link
          </button>
          <button className="btn btn-secondary btn-sm" type="button">
            AI Suite
          </button>
          <button className="btn btn-secondary btn-sm" type="button">
            Analytics
          </button>
        </div>
      </div>
    </div>
  );
}
