import frappe
from frappe.utils import flt, cint, getdate, nowdate


def _safe_date(value, fallback):
    try:
        return getdate(value) if value else getdate(fallback)
    except Exception:
        return getdate(fallback)


# ─────────────────────────────────────────────────────────────────────────────
# 1. Overdue Tasks
# ─────────────────────────────────────────────────────────────────────────────
@frappe.whitelist()
def get_overdue_tasks_data(from_date=None, to_date=None, project=None, customer=None):
    today = nowdate()
    conditions = ["t.status NOT IN ('Cancelled')"]
    values = {}

    if from_date:
        conditions.append("t.exp_end_date >= %(from_date)s")
        values["from_date"] = from_date
    if to_date:
        conditions.append("t.exp_end_date <= %(to_date)s")
        values["to_date"] = to_date
    if project:
        conditions.append("t.project = %(project)s")
        values["project"] = project
    if customer:
        conditions.append("t.project IN (SELECT name FROM `tabProject` WHERE customer = %(customer)s)")
        values["customer"] = customer

    where_clause = " AND ".join(conditions)

    rows = frappe.db.sql(f"""
        SELECT
            t.project,
            COUNT(*) AS total_tasks,
            SUM(
                CASE WHEN t.exp_end_date < %(today)s
                     AND t.status NOT IN ('Completed', 'Cancelled')
                THEN 1 ELSE 0 END
            ) AS overdue_tasks
        FROM `tabTask` t
        WHERE {where_clause}
          AND t.project IS NOT NULL
          AND t.project != ''
        GROUP BY t.project
        ORDER BY overdue_tasks DESC
        LIMIT 20
    """, dict(today=today, **values), as_dict=True)

    total_all = sum(cint(r.total_tasks) for r in rows)
    overdue_all = sum(cint(r.overdue_tasks) for r in rows)
    overall_pct = round((overdue_all / total_all) * 100, 1) if total_all else 0

    projects = []
    overdue_pcts = []
    for r in rows:
        pct = round((cint(r.overdue_tasks) / cint(r.total_tasks)) * 100, 1) if r.total_tasks else 0
        projects.append(r.project)
        overdue_pcts.append(pct)

    return {
        "kpi": {
            "value": overall_pct,
            "total": total_all,
            "overdue": overdue_all,
        },
        "chart": {
            "projects": projects,
            "overdue_pcts": overdue_pcts,
        }
    }


# ─────────────────────────────────────────────────────────────────────────────
# 2. Monthly Satisfaction Score  (Project Feedback)
# ─────────────────────────────────────────────────────────────────────────────
@frappe.whitelist()
def get_satisfaction_data(from_date=None, to_date=None, project=None, customer=None):
    conditions = ["pf.date_pfen IS NOT NULL"]
    values = {}

    if from_date:
        conditions.append("pf.date_pfen >= %(from_date)s")
        values["from_date"] = from_date
    if to_date:
        conditions.append("pf.date_pfen <= %(to_date)s")
        values["to_date"] = to_date
    if project:
        conditions.append("pf.project = %(project)s")
        values["project"] = project
    if customer:
        conditions.append("pf.customer = %(customer)s")
        values["customer"] = customer

    where_clause = " AND ".join(conditions)

    rows = frappe.db.sql(f"""
        SELECT
            DATE_FORMAT(pf.date_pfen, '%%Y-%%m') AS month,
            AVG(pf.comprehensive_project_review)  AS avg_score,
            COUNT(*)                               AS count
        FROM `tabProject Feedback` pf
        WHERE {where_clause}
        GROUP BY month
        ORDER BY month ASC
    """, values, as_dict=True)

    # Frappe Rating stores 0-1 (where 1 = 5 stars); normalise to 0-5
    def normalise(val):
        v = flt(val)
        return round(v * 5, 2) if v <= 1.0 else round(v, 2)

    months = [r.month for r in rows]
    scores = [normalise(r.avg_score) for r in rows]
    counts = [cint(r.count) for r in rows]

    overall_avg = round(sum(scores) / len(scores), 2) if scores else 0

    return {
        "kpi": {"value": overall_avg, "total_responses": sum(counts)},
        "chart": {"months": months, "scores": scores, "counts": counts},
    }


# ─────────────────────────────────────────────────────────────────────────────
# 3. Implementation → Support Handover TAT  (Project custom fields)
# ─────────────────────────────────────────────────────────────────────────────
@frappe.whitelist()
def get_handover_tat_data(from_date=None, to_date=None, project=None, customer=None):
    conditions = [
        "p.handover_tat_days IS NOT NULL",
        "p.handover_tat_days > 0",
    ]
    values = {}

    if from_date:
        conditions.append("p.support_ownership_date >= %(from_date)s")
        values["from_date"] = from_date
    if to_date:
        conditions.append("p.support_ownership_date <= %(to_date)s")
        values["to_date"] = to_date
    if project:
        conditions.append("p.name = %(project)s")
        values["project"] = project
    if customer:
        conditions.append("p.customer = %(customer)s")
        values["customer"] = customer

    where_clause = " AND ".join(conditions)

    rows = frappe.db.sql(f"""
        SELECT
            p.name                    AS project,
            p.customer,
            p.handover_tat_days,
            p.support_ownership_date
        FROM `tabProject` p
        WHERE {where_clause}
        ORDER BY p.support_ownership_date ASC
        LIMIT 30
    """, values, as_dict=True)

    projects = [r.project for r in rows]
    tats = [cint(r.handover_tat_days) for r in rows]
    avg_tat = round(sum(tats) / len(tats), 1) if tats else 0

    return {
        "kpi": {"value": avg_tat, "total_projects": len(rows)},
        "chart": {"projects": projects, "tats": tats},
    }


# ─────────────────────────────────────────────────────────────────────────────
# 4. Joining → Ready TAT  (Training Assignment)
# ─────────────────────────────────────────────────────────────────────────────
@frappe.whitelist()
def get_joining_ready_tat_data(from_date=None, to_date=None, employee=None):
    conditions = [
        "ta.status = 'Completed'",
        "ta.actual_completion_date IS NOT NULL",
        "e.date_of_joining IS NOT NULL",
        "ta.department LIKE '%%Implementation - DV%%'",
    ]
    values = {}

    if from_date:
        conditions.append("ta.actual_completion_date >= %(from_date)s")
        values["from_date"] = from_date
    if to_date:
        conditions.append("ta.actual_completion_date <= %(to_date)s")
        values["to_date"] = to_date
    if employee:
        conditions.append("ta.employee = %(employee)s")
        values["employee"] = employee

    where_clause = " AND ".join(conditions)

    rows = frappe.db.sql(f"""
        SELECT
            ta.name,
            ta.employee,
            ta.employee_name,
            ta.department,
            ta.assignment_date,
            ta.actual_completion_date,
            e.date_of_joining,
            DATEDIFF(ta.actual_completion_date, e.date_of_joining) AS tat_days
        FROM `tabTraining Assignment` ta
        INNER JOIN `tabEmployee` e ON e.name = ta.employee
        WHERE {where_clause}
        ORDER BY ta.actual_completion_date DESC
        LIMIT 30
    """, values, as_dict=True)

    tats = [cint(r.tat_days) for r in rows if r.tat_days is not None and r.tat_days >= 0]
    avg_tat = round(sum(tats) / len(tats), 1) if tats else 0

    # Chart — most recent 20, reversed for left→right chronological
    chart_rows = rows[:20]
    chart_rows.reverse()

    return {
        "kpi": {"value": avg_tat, "total_consultants": len(rows)},
        "chart": {
            "employees": [r.employee_name[:20] for r in chart_rows],
            "tats": [cint(r.tat_days) for r in chart_rows],
        },
    }