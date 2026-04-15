# Copyright (c) 2026, Mohamed Selim and contributors

import frappe
from frappe import _


@frappe.whitelist()
def send_feedback_email(demo_log):
	"""Manually send feedback request email for a demo."""
	doc = frappe.get_doc("Demo Log", demo_log)

	if not doc.lead:
		frappe.throw(_("No lead linked to this demo log."))

	lead = frappe.get_doc("Lead", doc.lead)
	if not lead.email_id:
		frappe.throw(_("Lead {0} has no email address.").format(lead.lead_name))

	doc._send_feedback_request(lead)
	frappe.msgprint(
		_("Feedback request sent to {0}").format(lead.email_id),
		indicator="green",
	)