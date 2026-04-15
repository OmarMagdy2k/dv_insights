# Copyright (c) 2026, Mohamed Selim and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint


class ProjectRequirements(Document):
	def validate(self):
		self._calculate_bant_score()
		self._validate_handover()

	def _calculate_bant_score(self):
		score = (
			cint(self.budget_confirmed)
			+ cint(self.authority_identified)
			+ cint(self.need_validated)
			+ cint(self.timeline_confirmed)
		)
		self.qualification_score = score

		labels = {0: "Not Qualified", 1: "Weak", 2: "Moderate", 3: "Strong", 4: "Fully Qualified"}
		self.lead_qualification = labels.get(score, "")

	def _validate_handover(self):
		if self.status == "Handed Over":
			if not self.handover_date:
				frappe.throw(_("Handover Date is required when status is Handed Over."))
			if not self.implementation_team:
				frappe.throw(_("Implementation Team Lead must be assigned before handover."))
			if self.handover_status != "Completed":
				self.handover_status = "Completed"