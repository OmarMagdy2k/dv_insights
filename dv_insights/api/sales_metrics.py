# -*- coding: utf-8 -*-
# Copyright (c) 2025, Data Value Solutions
# Sales Metrics Dashboard API
# File: operation_dv/api/sales_metrics.py

import frappe
from frappe import _
from frappe.utils import (
    nowdate, getdate, date_diff, add_days, flt, cint,
    get_first_day, get_last_day, add_months
)
from datetime import datetime, timedelta

# =============================================================================
# CONFIG — Adjust these to match your exact DocType / field names
# =============================================================================

# Metric 1: Sales to Implementation TAT
DEAL_DOCTYPE = "CRM Deal"
DEAL_CLOSED_DATE = "closed_date"       # Date when the deal was closed/won
DEAL_HANDOVER_DATE = "custom_implementation_handover_date"  # Date implementation handover completed
DEAL_WON_STATUS = "Won"                       # Status value for won deals
DEAL_STATUS_FIELD = "status"
DEAL_DATE_FIELD = DEAL_CLOSED_DATE             # Used for period filtering

# Metric 2: Lead SLA
LEAD_DOCTYPE = "CRM Lead"
LEAD_CREATION_FIELD = "creation"
SLA_HOURS = 24  # First response SLA threshold in hours

# Metric 3: Opportunity to Conversion
# Uses DEAL_DOCTYPE — Won / (Won + Lost)
DEAL_LOST_STATUS = "Lost"

# Metric 4: Demo Feedback
DEMO_FEEDBACK_DOCTYPE = "Demo Feedback"
DEMO_FEEDBACK_DATE = "feedback_date"           # Date field
DEMO_FEEDBACK_RATING = "rating"                # Float 1–5
DEMO_FEEDBACK_DEAL = "deal"                    # Link to CRM Deal (optional)

# Metric 5: Joining to Ready TAT
TRAINING_DOCTYPE = "Training Assignment"
TRAINING_STATUS_COMPLETED = "Completed"
# TAT = Employee.date_of_joining → Training Assignment.actual_completion_date
# Filter: department LIKE '%Sales%' (adjust if needed)
SALES_DEPARTMENT_FILTER = "%Sales - DV%"


# =============================================================================
# 1. SALES → IMPLEMENTATION TAT
# =============================================================================

@frappe.whitelist()
def get_sales_to_impl_tat_data(from_date=None, to_date=None):
    """
    KPI: Average days from deal closed → implementation handover complete.
    Chart: Bar chart — TAT per deal (or per month).
    Target: 7 days.
    """
    from_date = from_date or "2000-01-01"
    to_date = to_date or nowdate()

    deals = frappe.db.sql("""
        SELECT
            name,
            COALESCE(organization, name) AS deal_label,
            {closed} AS closed_date,
            {handover} AS handover_date,
            DATEDIFF({handover}, {closed}) AS tat_days
        FROM `tab{dt}`
        WHERE {closed} IS NOT NULL
          AND {handover} IS NOT NULL
          AND {closed} BETWEEN %(from_date)s AND %(to_date)s
        ORDER BY {closed} DESC
    """.format(
        dt=DEAL_DOCTYPE,
        closed=DEAL_CLOSED_DATE,
        handover=DEAL_HANDOVER_DATE,
    ), {"from_date": from_date, "to_date": to_date}, as_dict=True)

    # KPI
    tat_values = [flt(d.tat_days) for d in deals if d.tat_days is not None]
    avg_tat = round(sum(tat_values) / len(tat_values), 1) if tat_values else 0

    # Chart — bar per deal (limit to most recent 20)
    chart_deals = deals[:20]
    chart_deals.reverse()  # oldest → newest left to right

    return {
        "kpi": {
            "value": avg_tat,
            "total_deals": len(deals),
            "target": 7,
        },
        "chart": {
            "labels": [d.deal_label[:25] for d in chart_deals],
            "values": [flt(d.tat_days) for d in chart_deals],
        }
    }


# =============================================================================
# 2. LEAD RESPONSE SLA
# =============================================================================

@frappe.whitelist()
def get_lead_sla_data(from_date=None, to_date=None):
    """
    KPI: % of leads that received a first reply within SLA_HOURS.
    Chart: Line chart — monthly SLA compliance %.
    Target: 90%.
    Uses: first_responded_on (Datetime), first_response_time (Duration in seconds).
    """
    from_date = from_date or "2000-01-01"
    to_date = to_date or nowdate()
    frappe.errprint(f"Fetching leads from {from_date} to {to_date} for SLA calculation")

    leads = frappe.db.sql("""
        SELECT
            name,
            creation,
            first_responded_on,
            first_response_time,
            DATE_FORMAT(creation, '%%Y-%%m') AS lead_month
        FROM `tab{dt}`
        WHERE creation >= %(from_date)s AND creation < DATE_ADD(%(to_date)s, INTERVAL 1 DAY)
    """.format(dt=LEAD_DOCTYPE), {"from_date": from_date, "to_date": to_date}, as_dict=True)

    if not leads:
        return {
            "kpi": {"value": 0, "total_leads": 0, "within_sla": 0, "target": 90},
            "chart": {"months": [], "values": []}
        }

    monthly_data = {}
    total_within_sla = 0

    for lead in leads:
        m = lead.lead_month
        if m not in monthly_data:
            monthly_data[m] = {"total": 0, "within_sla": 0}

        monthly_data[m]["total"] += 1

        # first_response_time is a Duration field (stored as seconds in Frappe)
        response_seconds = flt(lead.first_response_time)

        if lead.first_responded_on and response_seconds > 0:
            response_hours = response_seconds / 3600
            if response_hours <= SLA_HOURS:
                monthly_data[m]["within_sla"] += 1
                total_within_sla += 1

    # KPI
    total_leads = len(leads)
    sla_pct = round((total_within_sla / total_leads) * 100, 1) if total_leads else 0

    # Chart — monthly SLA %
    sorted_months = sorted(monthly_data.keys())
    chart_values = [
        round((monthly_data[m]["within_sla"] / monthly_data[m]["total"]) * 100, 1)
        if monthly_data[m]["total"] else 0
        for m in sorted_months
    ]

    return {
        "kpi": {
            "value": sla_pct,
            "total_leads": total_leads,
            "within_sla": total_within_sla,
            "target": 90,
        },
        "chart": {
            "months": sorted_months,
            "values": chart_values,
        }
    }


# =============================================================================
# 3. OPPORTUNITY TO CONVERSION RATE
# =============================================================================

@frappe.whitelist()
def get_conversion_rate_data(from_date=None, to_date=None):
    """
    KPI: Won / (Won + Lost) as %.
    Chart: Line chart — monthly conversion rate.
    Target: 70%.
    """
    from_date = from_date or "2000-01-01"
    to_date = to_date or nowdate()

    deals = frappe.db.sql("""
        SELECT
            name,
            {status} AS deal_status,
            creation,
            DATE_FORMAT(creation, '%%Y-%%m') AS deal_month
        FROM `tab{dt}`
        WHERE {status} IN (%(won)s, %(lost)s)
          AND creation BETWEEN %(from_date)s AND %(to_date)s
    """.format(dt=DEAL_DOCTYPE, status=DEAL_STATUS_FIELD),
    {
        "won": DEAL_WON_STATUS,
        "lost": DEAL_LOST_STATUS,
        "from_date": from_date,
        "to_date": to_date,
    }, as_dict=True)

    # KPI
    total_won = sum(1 for d in deals if d.deal_status == DEAL_WON_STATUS)
    total_closed = len(deals)
    conversion_pct = round((total_won / total_closed) * 100, 1) if total_closed else 0

    # Monthly breakdown
    monthly = {}
    for d in deals:
        m = d.deal_month
        if m not in monthly:
            monthly[m] = {"won": 0, "total": 0}
        monthly[m]["total"] += 1
        if d.deal_status == DEAL_WON_STATUS:
            monthly[m]["won"] += 1

    sorted_months = sorted(monthly.keys())
    chart_values = []
    for m in sorted_months:
        md = monthly[m]
        pct = round((md["won"] / md["total"]) * 100, 1) if md["total"] else 0
        chart_values.append(pct)

    return {
        "kpi": {
            "value": conversion_pct,
            "total_won": total_won,
            "total_closed": total_closed,
            "target": 70,
        },
        "chart": {
            "months": sorted_months,
            "values": chart_values,
        }
    }


# =============================================================================
# 4. DEMO FEEDBACK SCORE
# =============================================================================

@frappe.whitelist()
def get_demo_feedback_data(from_date=None, to_date=None):
    """
    KPI: Average feedback rating (out of 5).
    Chart: Line chart — monthly average score.
    Target: 4.0/5.
    """
    from_date = from_date or "2000-01-01"
    to_date = to_date or nowdate()

    feedbacks = frappe.db.sql("""
        SELECT
            name,
            {rating} AS rating,
            {date_field} AS feedback_date,
            DATE_FORMAT({date_field}, '%%Y-%%m') AS feedback_month
        FROM `tab{dt}`
        WHERE {date_field} BETWEEN %(from_date)s AND %(to_date)s
          AND {rating} IS NOT NULL
          AND {rating} > 0
        ORDER BY {date_field}
    """.format(
        dt=DEMO_FEEDBACK_DOCTYPE,
        rating=DEMO_FEEDBACK_RATING,
        date_field=DEMO_FEEDBACK_DATE,
    ), {"from_date": from_date, "to_date": to_date}, as_dict=True)

    # KPI
    ratings = [flt(f.rating) for f in feedbacks]
    avg_score = round(sum(ratings) / len(ratings), 2) if ratings else 0

    # Monthly breakdown
    monthly = {}
    for f in feedbacks:
        m = f.feedback_month
        if m not in monthly:
            monthly[m] = {"total_score": 0, "count": 0}
        monthly[m]["total_score"] += flt(f.rating)
        monthly[m]["count"] += 1

    sorted_months = sorted(monthly.keys())
    chart_values = [
        round(monthly[m]["total_score"] / monthly[m]["count"], 2)
        if monthly[m]["count"] else 0
        for m in sorted_months
    ]

    return {
        "kpi": {
            "value": avg_score,
            "total_responses": len(feedbacks),
            "target": 4.0,
        },
        "chart": {
            "months": sorted_months,
            "values": chart_values,
        }
    }


# =============================================================================
# 5. JOINING → READY TAT (Training Assignment)
# =============================================================================

@frappe.whitelist()
def get_joining_ready_tat_data(from_date=None, to_date=None):
    """
    KPI: Average days from Employee.date_of_joining → Training Assignment.actual_completion_date.
    Chart: Bar chart — TAT per employee.
    Target: 45 days.
    """
    from_date = from_date or "2000-01-01"
    to_date = to_date or nowdate()

    records = frappe.db.sql("""
        SELECT
            ta.name,
            ta.employee,
            ta.employee_name,
            ta.department,
            ta.assignment_date,
            ta.actual_completion_date,
            e.date_of_joining,
            DATEDIFF(ta.actual_completion_date, e.date_of_joining) AS tat_days
        FROM `tab{ta}` ta
        INNER JOIN `tabEmployee` e ON e.name = ta.employee
        WHERE ta.status = %(completed)s
          AND ta.actual_completion_date IS NOT NULL
          AND e.date_of_joining IS NOT NULL
          AND ta.department LIKE %(dept_filter)s
          AND ta.actual_completion_date BETWEEN %(from_date)s AND %(to_date)s
        ORDER BY ta.actual_completion_date DESC
    """.format(ta=TRAINING_DOCTYPE),
    {
        "completed": TRAINING_STATUS_COMPLETED,
        "dept_filter": SALES_DEPARTMENT_FILTER,
        "from_date": from_date,
        "to_date": to_date,
    }, as_dict=True)

    # KPI
    tat_values = [flt(r.tat_days) for r in records if r.tat_days is not None and r.tat_days >= 0]
    avg_tat = round(sum(tat_values) / len(tat_values), 1) if tat_values else 0

    # Chart — bar per employee (limit 20)
    chart_records = records[:20]
    chart_records.reverse()

    return {
        "kpi": {
            "value": avg_tat,
            "total_employees": len(records),
            "target": 45,
        },
        "chart": {
            "employees": [r.employee_name[:20] for r in chart_records],
            "values": [flt(r.tat_days) for r in chart_records],
        }
    }