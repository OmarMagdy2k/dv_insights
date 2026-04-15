# Copyright (c) 2026, Mohamed Selim and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import getdate, nowdate


class CAPALog(Document):
	def validate(self):
		if self.status == "Open" and self.target_date and getdate(self.target_date) < getdate(nowdate()):
			self.status = "Overdue"

		if self.status in ("Completed", "Verified") and not self.completion_date:
			self.completion_date = nowdate()

		if self.status == "Verified" and not self.verified_by:
			self.verified_by = frappe.session.user
			self.verification_date = nowdate()