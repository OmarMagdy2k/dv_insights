# Copyright (c) 2026, Mohamed Selim and contributors
# API for Weekly Review Meeting auto-fetch

import frappe
from frappe import _
from frappe.utils import nowdate, add_months, flt, getdate


@frappe.whitelist()
def fetch_current_metrics():
	"""Fetch latest metrics from all departments for the weekly review meeting."""
	from_date = add_months(nowdate(), -1)
	to_date = nowdate()

	return {
		# ── Sales metrics ──
		"sales_lead_sla_pct": _get_lead_sla_pct(from_date, to_date),
		"sales_conversion_pct": _get_conversion_pct(from_date, to_date),
		"sales_demo_feedback_avg": _get_demo_feedback_avg(from_date, to_date),
		"sales_to_impl_tat_days": _get_sales_impl_tat(from_date, to_date),

		# ── Implementation metrics ──
		"impl_overdue_tasks_pct": _get_overdue_tasks_pct(),
		"impl_satisfaction_score": _get_satisfaction_score(from_date, to_date),
		"impl_to_support_tat_days": _get_impl_support_tat(from_date, to_date),
		"impl_joining_ready_tat_days": _get_joining_ready_tat(),

		# ── Support metrics ──
		"support_sla_pct": _get_support_sla_pct(from_date, to_date),
		"support_avg_first_response_hrs": _get_avg_first_response(from_date, to_date),
		"support_feedback_rating": _get_support_feedback_rating(from_date, to_date),
	}


# ── Sales helpers ─────────────────────────────────────────────────────────────

def _get_lead_sla_pct(from_date, to_date):
	"""% of leads responded within SLA (24 hours)."""
	try:
		leads = frappe.db.sql("""
			SELECT name, creation,
				(SELECT MIN(c.creation) FROM `tabCommunication` c
				 WHERE c.reference_doctype = 'CRM Lead' AND c.reference_name = l.name
				 AND c.sent_or_received = 'Sent') AS first_response
			FROM `tabCRM Lead` l
			WHERE l.creation BETWEEN %s AND %s
		""", (from_date, to_date), as_dict=True)

		if not leads:
			return 0

		within_sla = 0
		for lead in leads:
			if lead.first_response:
				diff_hours = (lead.first_response - lead.creation).total_seconds() / 3600
				if diff_hours <= 24:
					within_sla += 1

		return round((within_sla / len(leads)) * 100, 1) if leads else 0
	except Exception:
		return 0


def _get_conversion_pct(from_date, to_date):
	"""Won / (Won + Lost) from CRM Deal."""
	try:
		won = frappe.db.count("CRM Deal", {"status": "Won", "closed_date": ["between", [from_date, to_date]]})
		lost = frappe.db.count("CRM Deal", {"status": "Lost", "closed_date": ["between", [from_date, to_date]]})
		total = won + lost
		return round((won / total) * 100, 1) if total else 0
	except Exception:
		return 0


def _get_demo_feedback_avg(from_date, to_date):
	"""Average demo feedback rating."""
	try:
		avg = frappe.db.sql("""
			SELECT AVG(rating) as avg_rating
			FROM `tabDemo Feedback`
			WHERE feedback_date BETWEEN %s AND %s AND rating > 0
		""", (from_date, to_date), as_dict=True)
		return round(flt(avg[0].avg_rating), 2) if avg and avg[0].avg_rating else 0
	except Exception:
		return 0


def _get_sales_impl_tat(from_date, to_date):
	"""Average days from deal closed to implementation handover."""
	try:
		deals = frappe.db.sql("""
			SELECT AVG(DATEDIFF(implementation_handover_date, closed_date)) as avg_tat
			FROM `tabCRM Deal`
			WHERE status = 'Won'
			AND closed_date BETWEEN %s AND %s
			AND implementation_handover_date IS NOT NULL
		""", (from_date, to_date), as_dict=True)
		return round(flt(deals[0].avg_tat), 1) if deals and deals[0].avg_tat else 0
	except Exception:
		return 0


# ── Implementation helpers ────────────────────────────────────────────────────

def _get_overdue_tasks_pct():
	"""% of overdue tasks across active projects."""
	try:
		total = frappe.db.count("Task", {"project": ["is", "set"], "status": ["!=", "Cancelled"]})
		overdue = frappe.db.count("Task", {
			"project": ["is", "set"],
			"status": ["not in", ["Completed", "Cancelled"]],
			"exp_end_date": ["<", nowdate()],
		})
		return round((overdue / total) * 100, 1) if total else 0
	except Exception:
		return 0


def _get_satisfaction_score(from_date, to_date):
	"""Average monthly satisfaction score from Monthly Project Feedback."""
	try:
		avg = frappe.db.sql("""
			SELECT AVG(overall_satisfaction) as avg_score
			FROM `tabMonthly Project Feedback`
			WHERE feedback_date BETWEEN %s AND %s
		""", (from_date, to_date), as_dict=True)
		return round(flt(avg[0].avg_score) * 5, 2) if avg and avg[0].avg_score else 0
	except Exception:
		return 0


def _get_impl_support_tat(from_date, to_date):
	"""Average implementation to support handover TAT."""
	try:
		avg = frappe.db.sql("""
			SELECT AVG(handover_tat_days) as avg_tat
			FROM `tabProject`
			WHERE support_ownership_date BETWEEN %s AND %s
			AND handover_tat_days > 0
		""", (from_date, to_date), as_dict=True)
		return round(flt(avg[0].avg_tat), 1) if avg and avg[0].avg_tat else 0
	except Exception:
		return 0


def _get_joining_ready_tat():
	"""Average joining to ready TAT for implementation consultants."""
	try:
		avg = frappe.db.sql("""
			SELECT AVG(DATEDIFF(actual_completion_date, e.date_of_joining)) as avg_tat
			FROM `tabTraining Assignment` ta
			JOIN `tabEmployee` e ON ta.employee = e.name
			WHERE ta.status = 'Completed'
			AND ta.actual_completion_date IS NOT NULL
			AND e.date_of_joining IS NOT NULL
		""", as_dict=True)
		return round(flt(avg[0].avg_tat), 1) if avg and avg[0].avg_tat else 0
	except Exception:
		return 0


# ── Support helpers ───────────────────────────────────────────────────────────

def _get_support_sla_pct(from_date, to_date):
	"""% of tickets with SLA fulfilled from HD Ticket."""
	try:
		total = frappe.db.count("HD Ticket", {
			"creation": ["between", [from_date, to_date]],
		})
		fulfilled = frappe.db.count("HD Ticket", {
			"creation": ["between", [from_date, to_date]],
			"agreement_status": "Fulfilled",
		})
		return round((fulfilled / total) * 100, 1) if total else 0
	except Exception:
		return 0


def _get_avg_first_response(from_date, to_date):
	"""Average first response time in hours from HD Ticket."""
	try:
		avg = frappe.db.sql("""
			SELECT AVG(first_response_time) as avg_frt
			FROM `tabHD Ticket`
			WHERE creation BETWEEN %s AND %s
			AND first_response_time > 0
		""", (from_date, to_date), as_dict=True)
		val = flt(avg[0].avg_frt) if avg and avg[0].avg_frt else 0
		return round(val / 3600, 1) if val else 0
	except Exception:
		return 0


def _get_support_feedback_rating(from_date, to_date):
	"""Average customer feedback rating on closed tickets."""
	try:
		avg = frappe.db.sql("""
			SELECT AVG(feedback_rating) as avg_rating
			FROM `tabHD Ticket`
			WHERE creation BETWEEN %s AND %s
			AND feedback_rating > 0
		""", (from_date, to_date), as_dict=True)
		return round(flt(avg[0].avg_rating), 2) if avg and avg[0].avg_rating else 0
	except Exception:
		return 0