# Copyright (c) 2026, Mohamed Selim and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import getdate, formatdate


class MonthlyProjectFeedback(Document):
	def validate(self):
		if not self.feedback_month:
			dt = getdate(self.feedback_date)
			self.feedback_month = formatdate(dt, "MMMM YYYY")

		if self.overall_satisfaction and self.overall_satisfaction <= 0.4:
			frappe.msgprint(
				frappe._("Low satisfaction score detected. Consider creating a CAPA for this project."),
				indicator="red",
				title=frappe._("Low Satisfaction Alert"),
			)