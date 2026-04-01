# Copyright (c) 2026, Mohamed Selim and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class TrainingTemplate(Document):
	def validate(self):
		self.calculate_totals()

	def calculate_totals(self):
		self.total_items = len(self.items)
		self.total_expected_minutes = sum(row.expected_minutes or 0 for row in self.items)
