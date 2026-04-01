# Copyright (c) 2026, Mohamed Selim and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class TrainingConfiguration(Document):
	def validate(self):
		self.validate_duplicate_departments()

	def validate_duplicate_departments(self):
		seen = set()
		for row in self.departments:
			if row.department_name in seen:
				frappe.throw(f"Duplicate department: <b>{row.department_name}</b>")
			seen.add(row.department_name)