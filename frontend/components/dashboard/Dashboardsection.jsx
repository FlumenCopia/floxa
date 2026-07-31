"use client";

import { useEffect, useMemo, useState } from "react";
import { getConsultantActivities, getProjects } from "../../src/lib/projectApi";
import { getStatusClass, getStatusLabel } from "../Allproject/ProjectSection";
import { useRouter } from "next/navigation";
import ProjectCreateWizard from "./ProjectCreateWizard";

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

function formatActivityTime(value) {
  if (!value) {
    return "Time unavailable";
  }

  return new Date(value).toLocaleString();
}

export default function Dashboardsection() {
      const router = useRouter();

  const [projects, setProjects] = useState([]);
  const [totalProjectsCount, setTotalProjectsCount] = useState(0);
  const [activities, setActivities] = useState([]);
  const [isLoadingActivities, setIsLoadingActivities] = useState(true);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [isWizardOpen, setIsWizardOpen] = useState(false);

  useEffect(() => {
    async function loadProjects() {
      try {
        const data = await getProjects();
        setProjects(data.results || []);
        setTotalProjectsCount(Number(data.count || 0));
      } catch (error) {
        console.error("Failed to load projects:", error);
        setProjects([]);
        setTotalProjectsCount(0);
      } finally {
        setIsLoadingProjects(false);
      }
    }

    loadProjects();
  }, []);

  useEffect(() => {
    async function loadActivities() {
      try {
        const data = await getConsultantActivities();
        setActivities(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error("Failed to load dashboard activities:", error);
        setActivities([]);
      } finally {
        setIsLoadingActivities(false);
      }
    }

    loadActivities();
  }, []);

  const averageCompletion = useMemo(() => {
    if (projects.length === 0) {
      return 0;
    }

    const totalProgress = projects.reduce((total, project) => total + Number(project.progress || 0), 0);
    return Math.round(totalProgress / projects.length);
  }, [projects]);

  const stats = [
    {
      label: "Active Projects",
      value: String(totalProjectsCount),
      change: `${totalProjectsCount} total projects`,
      icon: "project",
      deltaClass: "up",
    },
    {
      label: "Revenue This Month",
      value: "Unavailable",
      change: "Revenue data unavailable",
      icon: "revenue",
      deltaClass: "",
    },
    {
      label: "AI Adoption Rate",
      value: "Unavailable",
      change: "AI usage data unavailable",
      icon: "ai",
      deltaClass: "",
    },
    {
      label: "Avg Completion",
      value: `${averageCompletion}%`,
      change: "Based on projects",
      icon: "completion",
      deltaClass: "up",
    },
  ];

  const recentProjects = projects;

  const handleOpenWizard = () => {
    setIsWizardOpen(true);
  };

  return (
    <div className="content">
      <div className="screen active" id="screen-dashboard">
        {isWizardOpen ? (
          <ProjectCreateWizard
            onClose={() => setIsWizardOpen(false)}
            onProjectCreated={(createdProject) => {
              setProjects((current) => [createdProject, ...current]);
              setTotalProjectsCount((current) => current + 1);
            }}
          />
        ) : null}

        {!isWizardOpen ? (
          <>
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
          <div className="card dashboard-card dashboard-projects-card">
            <div className="row-sb dashboard-card-header">
              <div className="font-6 dashboard-card-title">Recent projects</div>
              <div className="dashboard-card-actions">
                <button
                  className="btn btn-secondary dashboard-outline-btn"
                  type="button"
                  onClick={() => router.push("/project")}
                >
                  View all
                </button>
                <button className="btn btn-primary dashboard-solid-btn" type="button" onClick={handleOpenWizard}>
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
                  {isLoadingProjects ? (
                    <tr>
                      <td colSpan="3">Loading projects...</td>
                    </tr>
                  ) : null}

                  {!isLoadingProjects && recentProjects.length === 0 ? (
                    <tr>
                      <td colSpan="3">No projects found.</td>
                    </tr>
                  ) : null}

                 {!isLoadingProjects
  ? recentProjects.map((project) => (
      <tr
        key={project.id}
        onClick={() => router.push(`/discovery?projectId=${project.id}`)}
        style={{ cursor: "pointer" }}
      >
        <td>
                            <div className="font-6 dash-client-name">{project.company_name || project.client_name}</div>
                            <div className="dash-client-sector">{project.sector}</div>
                          </td>
                          <td>
                            <span className={`badge ${getStatusClass(project.workflow_status || project.status)}`}>
                              {getStatusLabel(project.workflow_status || project.status)}
                            </span>
                          </td>
                          <td>
                            <div className="progress-cell">
                              <div className="progress-track">
                                <div className="progress-fill" style={{ width: `${Number(project.progress || 0)}%` }} />
                              </div>
                              <span className="progress-value">{Number(project.progress || 0)}%</span>
                            </div>
                          </td>
                        </tr>
                      ))
                    : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card dashboard-card activity-card">
            <div className="row-sb dashboard-card-header">
              <div className="font-6 dashboard-card-title">Recent activity</div>
            </div>
            <div className="activity-date">Activity</div>
            {isLoadingActivities ? (
              <div className="activity-item">
                <div className="act-av system">--</div>
                <div>
                  <div className="act-action">Loading activity</div>
                  <div className="act-time">Recent project actions are being fetched.</div>
                </div>
              </div>
            ) : null}
            {!isLoadingActivities && activities.length === 0 ? (
              <div className="activity-item">
                <div className="act-av system">--</div>
                <div>
                  <div className="act-action">No recent activity</div>
                  <div className="act-time">Activity will appear here when available.</div>
                </div>
              </div>
            ) : null}
            {!isLoadingActivities
              ? activities.map((activity) => (
                  <div className="activity-item" key={activity.id}>
                    <div className="act-av system">{activity.actor_type?.slice(0, 2).toUpperCase() || "--"}</div>
                    <div>
                      <div className="act-action">
                        {activity.project_name || "Project"} - {activity.description || activity.action}
                      </div>
                      <div className="act-time">
                        {activity.actor_type || "system"} - {formatActivityTime(activity.created_at)}
                      </div>
                    </div>
                  </div>
                ))
              : null}
          </div>
        </div>

        
          </>
        ) : null}
      </div>
    </div>
  );
}
