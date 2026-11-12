"use client";

import { useEffect, useMemo, useState } from "react";
import { getAnalytics, getConsultantActivities, getProjects } from "@/lib/projectApi";
import { getStatusClass, getStatusLabel } from "../all-projects/ProjectSection";
import { useRouter } from "next/navigation";
import ProjectCreateWizard from "./ProjectCreateWizard";
import ConsultantTour from "./ConsultantTour";
import { getCurrentConsultant } from "@/lib/authApi";
import { FolderKanban, IndianRupee, Sparkles, Clock, Plus } from "lucide-react";

function KpiIcon({ type }) {
  switch (type) {
    case "revenue":
      return <IndianRupee size={22} strokeWidth={1.8} />;
    case "ai":
      return <Sparkles size={22} strokeWidth={1.8} />;
    case "completion":
      return <Clock size={22} strokeWidth={1.8} />;
    case "project":
    default:
      return <FolderKanban size={22} strokeWidth={1.8} />;
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

  const [consultant, setConsultant] = useState(null);
  const [projects, setProjects] = useState([]);
  const [totalProjectsCount, setTotalProjectsCount] = useState(0);
  const [analytics, setAnalytics] = useState(null);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(true);
  const [activities, setActivities] = useState([]);
  const [isLoadingActivities, setIsLoadingActivities] = useState(true);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [isWizardOpen, setIsWizardOpen] = useState(false);

  useEffect(() => {
    getCurrentConsultant()
      .then((data) => {
        if (data) setConsultant(data);
      })
      .catch((err) => console.error("Failed to load consultant profile:", err));
  }, []);

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

  useEffect(() => {
    async function loadAnalytics() {
      try {
        const data = await getAnalytics();
        setAnalytics(data || null);
      } catch (error) {
        console.error("Failed to load dashboard analytics:", error);
        setAnalytics(null);
      } finally {
        setIsLoadingAnalytics(false);
      }
    }

    loadAnalytics();
  }, []);

  const averageCompletion = useMemo(() => {
    if (projects.length === 0) {
      return 0;
    }

    const totalProgress = projects.reduce((total, project) => total + Number(project.progress || 0), 0);
    return Math.round(totalProgress / projects.length);
  }, [projects]);

  const aiAdoption = useMemo(() => {
    if (projects.length === 0) {
      return { rate: 0, count: 0 };
    }
    const aiCount = projects.filter((p) => p.hasBrandDna).length;
    return {
      rate: Math.round((aiCount / projects.length) * 100),
      count: aiCount,
    };
  }, [projects]);

  const revenueLast6Months = Array.isArray(analytics?.revenue_last_6_months)
    ? analytics.revenue_last_6_months
    : [];
  const revenueThisMonth = revenueLast6Months.length > 0
    ? Number(revenueLast6Months[revenueLast6Months.length - 1]?.amount || 0)
    : Number(analytics?.total_paid_revenue || 0);
  const totalPaidRevenue = Number(analytics?.total_paid_revenue || 0);
  const pendingRevenue = Number(analytics?.payment_pending_amount || 0);

  const stats = [
    {
      label: "Active Projects",
      value: String(analytics?.active_projects ?? totalProjectsCount),
      change: `${totalProjectsCount} total projects`,
      icon: "project",
      deltaClass: "up",
    },
    {
      label: "Revenue This Month",
      value: isLoadingAnalytics ? "..." : `₹${revenueThisMonth.toLocaleString("en-IN")}`,
      change: isLoadingAnalytics
        ? "Loading revenue..."
        : pendingRevenue > 0
          ? `Total paid ₹${totalPaidRevenue.toLocaleString("en-IN")} • Pending ₹${pendingRevenue.toLocaleString("en-IN")}`
          : `Total paid: ₹${totalPaidRevenue.toLocaleString("en-IN")}`,
      icon: "revenue",
      deltaClass: totalPaidRevenue > 0 ? "up" : "",
    },
    {
      label: "AI Adoption Rate",
      value: isLoadingProjects ? "..." : `${aiAdoption.rate}%`,
      change: isLoadingProjects
        ? "Calculating..."
        : `${aiAdoption.count} of ${projects.length} projects with Brand DNA`,
      icon: "ai",
      deltaClass: aiAdoption.rate > 0 ? "up" : "",
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
      <ConsultantTour consultant={consultant} onOpenWizard={handleOpenWizard} />
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
                  <Plus size={15} strokeWidth={2.2} style={{ display: "inline-block", verticalAlign: "-2px", marginRight: "4px" }} />
                  New
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
                            <div className="font-6 dash-client-name">{project.client_name || project.company_name}</div>
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
