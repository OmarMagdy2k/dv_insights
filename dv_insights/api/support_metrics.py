# Copyright (c) 2026, Mohamed Selim and contributors
# Support Metrics Dashboard API

import frappe
from frappe import _
from frappe.utils import nowdate, getdate, flt, add_days, get_first_day, get_last_day


# =============================================================================
# 1. SLA FULFILMENT
# =============================================================================

@frappe.whitelist()
def get_sla_data(from_date=None, to_date=None):
	from_date = from_date or "2000-01-01"
	to_date = to_date or nowdate()

	tickets = frappe.db.sql("""
		SELECT
			name,
			creation,
			agreement_status,
			DATE_FORMAT(creation, '%%Y-W%%u') AS week_label
		FROM `tabHD Ticket`
		WHERE creation BETWEEN %(from_date)s AND %(to_date)s
	""", {"from_date": from_date, "to_date": to_date}, as_dict=True)

	total = len(tickets)
	fulfilled = sum(1 for t in tickets if t.agreement_status == "Fulfilled")
	sla_pct = round((fulfilled / total) * 100, 1) if total else 0

	weekly = {}
	for t in tickets:
		w = t.week_label
		if w not in weekly:
			weekly[w] = {"total": 0, "fulfilled": 0}
		weekly[w]["total"] += 1
		if t.agreement_status == "Fulfilled":
			weekly[w]["fulfilled"] += 1

	sorted_weeks = sorted(weekly.keys())
	chart_values = [
		round((weekly[w]["fulfilled"] / weekly[w]["total"]) * 100, 1)
		if weekly[w]["total"] else 0
		for w in sorted_weeks
	]

	return {
		"kpi": {"value": sla_pct, "total_tickets": total},
		"chart": {"weeks": sorted_weeks, "values": chart_values},
	}


# =============================================================================
# 2. FEEDBACK RATING
# =============================================================================

@frappe.whitelist()
def get_feedback_data(from_date=None, to_date=None):
	from_date = from_date or "2000-01-01"
	to_date = to_date or nowdate()

	tickets = frappe.db.sql("""
		SELECT
			name,
			feedback_rating,
			creation,
			DATE_FORMAT(creation, '%%Y-W%%u') AS week_label
		FROM `tabHD Ticket`
		WHERE creation BETWEEN %(from_date)s AND %(to_date)s
		AND feedback_rating IS NOT NULL
		AND feedback_rating > 0
	""", {"from_date": from_date, "to_date": to_date}, as_dict=True)

	ratings = [flt(t.feedback_rating) for t in tickets]
	avg_rating = round(sum(ratings) / len(ratings), 2) if ratings else 0

	weekly = {}
	for t in tickets:
		w = t.week_label
		if w not in weekly:
			weekly[w] = {"total": 0, "count": 0}
		weekly[w]["total"] += flt(t.feedback_rating)
		weekly[w]["count"] += 1

	sorted_weeks = sorted(weekly.keys())
	chart_values = [
		round(weekly[w]["total"] / weekly[w]["count"], 2) if weekly[w]["count"] else 0
		for w in sorted_weeks
	]

	return {
		"kpi": {"value": avg_rating, "total_responses": len(tickets)},
		"chart": {"weeks": sorted_weeks, "values": chart_values},
	}


# =============================================================================
# 3. FIRST RESPONSE TIME
# =============================================================================

@frappe.whitelist()
def get_first_response_data(from_date=None, to_date=None):
	from_date = from_date or "2000-01-01"
	to_date = to_date or nowdate()

	tickets = frappe.db.sql("""
		SELECT
			name,
			first_response_time,
			creation,
			DATE_FORMAT(creation, '%%Y-W%%u') AS week_label
		FROM `tabHD Ticket`
		WHERE creation BETWEEN %(from_date)s AND %(to_date)s
		AND first_response_time IS NOT NULL
		AND first_response_time > 0
	""", {"from_date": from_date, "to_date": to_date}, as_dict=True)

	frt_hours = [flt(t.first_response_time) / 3600 for t in tickets]
	avg_frt = round(sum(frt_hours) / len(frt_hours), 1) if frt_hours else 0

	weekly = {}
	for t in tickets:
		w = t.week_label
		if w not in weekly:
			weekly[w] = {"total_seconds": 0, "count": 0}
		weekly[w]["total_seconds"] += flt(t.first_response_time)
		weekly[w]["count"] += 1

	sorted_weeks = sorted(weekly.keys())
	chart_values = [
		round((weekly[w]["total_seconds"] / weekly[w]["count"]) / 3600, 1)
		if weekly[w]["count"] else 0
		for w in sorted_weeks
	]

	return {
		"kpi": {"value": avg_frt},
		"chart": {"weeks": sorted_weeks, "values": chart_values},
	}


# =============================================================================
# 4. LOW-RATED TICKET ANALYSIS
# =============================================================================

@frappe.whitelist()
def get_low_rated_data(from_date=None, to_date=None):
	from_date = from_date or "2000-01-01"
	to_date = to_date or nowdate()

	tickets = frappe.db.sql("""
		SELECT
			name,
			feedback_rating,
			creation,
			DATE_FORMAT(creation, '%%Y-W%%u') AS week_label
		FROM `tabHD Ticket`
		WHERE creation BETWEEN %(from_date)s AND %(to_date)s
		AND feedback_rating IS NOT NULL
		AND feedback_rating > 0
		AND feedback_rating <= 0.4
	""", {"from_date": from_date, "to_date": to_date}, as_dict=True)

	weekly = {}
	for t in tickets:
		w = t.week_label
		weekly[w] = weekly.get(w, 0) + 1

	sorted_weeks = sorted(weekly.keys())
	chart_values = [weekly[w] for w in sorted_weeks]

	return {
		"kpi": {"count": len(tickets)},
		"chart": {"weeks": sorted_weeks, "values": chart_values},
	}
