# Copyright (c) 2026, Mohamed Selim and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import getdate, date_diff, flt


class ChangeRequest(Document):
	def validate(self):
		self._calculate_deltas()
		self._validate_approval()

	def before_submit(self):
		if self.customer_approval_status != "Approved":
			frappe.throw(
				frappe._("Change Request cannot be submitted without customer approval."),
				title=frappe._("Approval Required"),
			)
		if not self.customer_sign_off:
			frappe.throw(
				frappe._("Please attach customer sign-off proof before submitting."),
				title=frappe._("Sign-off Required"),
			)
		self.status = "Approved"

	def _calculate_deltas(self):
		if self.original_end_date and self.new_end_date:
			self.additional_days = date_diff(self.new_end_date, self.original_end_date)

		if self.original_budget and self.revised_budget:
			self.additional_cost = flt(self.revised_budget) - flt(self.original_budget)

	def _validate_approval(self):
		if self.customer_approval_status == "Approved" and not self.approval_date:
			self.approval_date = frappe.utils.nowdate()