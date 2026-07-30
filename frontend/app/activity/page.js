"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Floxaheader from "../../commone/Floxaheader";
import { getProject, getProjectActivities } from "../../src/lib/projectApi";

function formatActivityTime(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getActivityGroupLabel(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Older";
  }

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return "Today";
  }

  if (date.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }

  return date.toLocaleDateString([], {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function groupActivities(activities) {
  return activities.reduce((groups, activity) => {
    const label = getActivityGroupLabel(activity.created_at);
    const group = groups.find((item) => item.label === label);

    if (group) {
      group.items.push(activity);
      return groups;
    }

    return [...groups, { label, items: [activity] }];
  }, []);
}

function ActivityPageContent() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId");
  const [project, setProject] = useState(null);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!projectId) {
      return;
    }

    async function loadActivityPage() {
      setLoading(true);

      try {
        const [projectData, activityData] = await Promise.all([
          getProject(projectId),
          getProjectActivities(projectId),
        ]);

        setProject(projectData);
        setActivities(Array.isArray(activityData) ? activityData : []);
      } catch (error) {
        console.error("Failed to load activity page:", error);
        setProject(null);
        setActivities([]);
      } finally {
        setLoading(false);
      }
    }

    loadActivityPage();
  }, [projectId]);

  const groupedActivities = useMemo(() => groupActivities(activities), [activities]);

  return (
    <div className="shell">
      <Floxaheader
        title={project?.company_name || "Activity"}
        activeNav="Discovery"
        notificationCount={activities.length}
        notifications={activities.slice(0, 5)}
        notificationsLoading={loading}
      >
        <div className="content">
          <div className="screen">
            <div className="discovery-shell">
              <section className="discovery-card discovery-summary">
                <div className="discovery-summary-main">
                  <div className="discovery-summary-copy">
                    <div className="discovery-summary-head">
                      <h1 className="discovery-summary-title">Activity</h1>
                    </div>
                    <div className="discovery-summary-meta">
                      {project?.company_name || "Project activity history"}
                    </div>
                  </div>
                </div>
              </section>

              <section className="discovery-card discovery-activity-board">
                <div className="discovery-activity-group">
                  <div className="discovery-activity-group-label">Project Activity</div>
                  <div className="discovery-activity-list">
                    {loading ? (
                      <div className="discovery-activity-item">
                        <div className="discovery-activity-avatar spark">--</div>
                        <div className="discovery-activity-copy">
                          <div className="discovery-activity-text">Loading activity</div>
                          <div className="discovery-activity-time">Fetching complete activity history.</div>
                        </div>
                      </div>
                    ) : null}

                    {!loading && groupedActivities.length === 0 ? (
                      <div className="discovery-activity-item">
                        <div className="discovery-activity-avatar spark">--</div>
                        <div className="discovery-activity-copy">
                          <div className="discovery-activity-text">No activity yet.</div>
                          <div className="discovery-activity-time">Activity will appear here when available.</div>
                        </div>
                      </div>
                    ) : null}

                    {!loading && groupedActivities.map((group) => (
                      <div className="discovery-activity-group" key={group.label}>
                        <div className="discovery-activity-group-label">{group.label}</div>
                        {group.items.map((activity) => (
                          <div className="discovery-activity-item" key={activity.id}>
                            <div className="discovery-activity-avatar spark">
                              {activity.actor_type?.slice(0, 2).toUpperCase() || "--"}
                            </div>
                            <div className="discovery-activity-copy">
                              <div className="discovery-activity-text">
                                {activity.description || activity.action}
                              </div>
                              <div className="discovery-activity-time">
                                {activity.actor_type || "system"} - {formatActivityTime(activity.created_at)}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </Floxaheader>
    </div>
  );
}

export default function ActivityPage() {
  return (
    <Suspense fallback={null}>
      <ActivityPageContent />
    </Suspense>
  );
}
