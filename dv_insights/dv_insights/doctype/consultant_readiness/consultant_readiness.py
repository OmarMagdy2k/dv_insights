# Copyright (c) 2026, Mohamed Selim and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import date_diff, getdate


class ConsultantReadiness(Document):
	def validate(self):
		self._calculate_tat()

	def _calculate_tat(self):
		if self.date_of_joining and self.completion_date:
			self.readiness_tat_days = date_diff(
				getdate(self.completion_date), getdate(self.date_of_joining)
			)
		else:
			self.readiness_tat_days = 0