# Copyright (c) 2026, Mohamed Selim and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class DemoLog(Document):
	def after_insert(self):
		"""Auto-trigger feedback form email after demo is logged."""
		if not self.lead:
			return

		lead = frappe.get_doc("Lead", self.lead)
		if not lead.email_id:
			return

		self._send_feedback_request(lead)

	def _send_feedback_request(self, lead):
		try:
			feedback_url = frappe.utils.get_url(
				f"/api/method/frappe.client.get_count?doctype=Demo Feedback"
			)

			frappe.sendmail(
				recipients=[lead.email_id],
				subject=f"We'd love your feedback on the {self.demo_type} - {lead.company_name or lead.lead_name}",
				message=f"""
				<p>Dear {lead.lead_name},</p>
				<p>Thank you for attending the {self.demo_type.lower()} on {frappe.utils.formatdate(self.demo_date)}.</p>
				<p>Your feedback helps us improve our demonstrations and better understand your needs.
				We would appreciate it if you could take a moment to share your thoughts.</p>
				<p>Please reply to this email with your feedback or reach out to {self.conducted_by} directly.</p>
				<p>Best regards,<br>The Sales Team</p>
				""",
				now=True,
			)

			self.db_set("feedback_sent", 1, update_modified=False)
			self.db_set("feedback_sent_date", frappe.utils.nowdate(), update_modified=False)

			frappe.msgprint(
				frappe._("Feedback request email sent to {0}").format(lead.email_id),
				indicator="green",
				title=frappe._("Feedback Sent"),
			)
		except Exception:
			frappe.log_error("Demo Feedback Email Failed")