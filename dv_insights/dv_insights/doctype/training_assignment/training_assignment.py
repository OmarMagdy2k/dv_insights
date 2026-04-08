# Copyright (c) 2026, Mohamed Selim and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime, time_diff_in_seconds, flt, today
from dv_insights.api.training import training_assignment_on_update


class TrainingAssignment(Document):
	def before_insert(self):
		self.fetch_template_items()
		self.auto_set_team_leader()

	def validate(self):
		self.calculate_results()
		self.calculate_progress()
		self.update_status()
  
	def on_update(self):
		training_assignment_on_update(self)

	def calculate_results(self):
		for row in self.assessments:
			if row.score and row.score > 0:
				passing = row.passing_score or 60
				row.result = "Pass" if row.score >= passing else "Fail"

	def fetch_template_items(self):
		if not self.template or self.assessments:
			return

		template = frappe.get_doc("Training Template", self.template)
		for item in template.items:
			self.append("assessments", {
				"subject": item.subject,
				"description": item.description,
				"expected_minutes": item.expected_minutes,
				"passing_score": item.passing_score or 60,
				"reference_material": item.reference_material,
				"status": "Not Started",
			})

	def auto_set_team_leader(self):
		if self.team_leader or not self.department:
			return

		config = frappe.get_single("Training Configuration")
		if not config.auto_assign_team_leader:
			return

		for row in config.departments:
			if row.department_name == self.department:
				self.team_leader = row.team_leader
				self.team_leader_name = row.team_leader_name
				break

	def calculate_progress(self):
		if not self.assessments:
			return

		total = len(self.assessments)
		completed = 0
		total_expected = 0
		total_actual = 0
		total_score = 0
		scored_count = 0

		for row in self.assessments:
			total_expected += row.expected_minutes or 0
			total_actual += row.actual_minutes or 0

			if row.status == "Completed":
				completed += 1
			if row.score:
				total_score += row.score
				scored_count += 1

		self.total_expected_minutes = total_expected
		self.total_actual_minutes = flt(total_actual, 1)
		self.progress_percentage = flt(completed / total * 100, 1) if total else 0
		self.overall_score = flt(total_score / scored_count, 1) if scored_count else 0

	def update_status(self):
		if not self.assessments or self.status == "Cancelled":
			return

		all_completed = all(row.status == "Completed" for row in self.assessments)
		any_in_progress = any(row.status == "In Progress" for row in self.assessments)
		any_completed = any(row.status == "Completed" for row in self.assessments)

		if all_completed:
			self.status = "Completed"
			if not self.actual_completion_date:
				self.actual_completion_date = today()
		elif any_in_progress or any_completed:
			self.status = "In Progress"
		else:
			self.status = "Not Started"


# ── Permission Hooks (registered in hooks.py) ────────────────────────────────


def has_permission(doc, ptype, user):
	"""Allow access if user is the trainee, team leader, or document owner."""
	if "System Manager" in frappe.get_roles(user):
		return True

	employee = _get_employee_from_user(user)
	if not employee:
		return False

	if doc.employee == employee or doc.team_leader == employee:
		return True

	if doc.owner == user:
		return True

	return False


def get_permission_query_conditions(user):
	"""Filter list view: show only assignments where user is trainee or team leader."""
	if not user:
		user = frappe.session.user

	if "System Manager" in frappe.get_roles(user):
		return ""

	employee = _get_employee_from_user(user)
	if not employee:
		return "1=0"

	employee = frappe.db.escape(employee)
	user = frappe.db.escape(user)

	return (
		f"(`tabTraining Assignment`.employee = {employee}"
		f" OR `tabTraining Assignment`.team_leader = {employee}"
		f" OR `tabTraining Assignment`.owner = {user})"
	)


def _get_employee_from_user(user):
	return frappe.db.get_value("Employee", {"user_id": user, "status": "Active"}, "name")


# ── Whitelisted APIs ──────────────────────────────────────────────────────────


@frappe.whitelist()
def start_assessment(docname, row_idx):
	doc = frappe.get_doc("Training Assignment", docname)
	row_idx = int(row_idx)

	for row in doc.assessments:
		if row.idx != row_idx and row.status == "In Progress":
			frappe.throw(
				f"Assessment <b>{row.subject}</b> (Row {row.idx}) is already in progress. "
				"Please stop it first before starting another."
			)

	row = next((r for r in doc.assessments if r.idx == row_idx), None)
	if not row:
		frappe.throw(f"Row {row_idx} not found.")
	if row.status == "Completed":
		frappe.throw(f"Assessment <b>{row.subject}</b> is already completed.")
	if row.status == "In Progress":
		frappe.throw(f"Assessment <b>{row.subject}</b> is already in progress.")

	row.status = "In Progress"
	row.start_time = now_datetime()
	row.end_time = None
	row.actual_minutes = 0

	doc.save(ignore_permissions=True)
	frappe.db.commit()

	return {"start_time": str(row.start_time), "status": row.status}


@frappe.whitelist()
def stop_assessment(docname, row_idx):
	doc = frappe.get_doc("Training Assignment", docname)
	row_idx = int(row_idx)

	row = next((r for r in doc.assessments if r.idx == row_idx), None)
	if not row:
		frappe.throw(f"Row {row_idx} not found.")
	if row.status != "In Progress":
		frappe.throw(f"Assessment <b>{row.subject}</b> is not in progress.")

	row.end_time = now_datetime()
	row.status = "Completed"
	diff_seconds = time_diff_in_seconds(row.end_time, row.start_time)
	row.actual_minutes = flt(diff_seconds / 60, 1)

	doc.save(ignore_permissions=True)
	frappe.db.commit()

	return {"end_time": str(row.end_time), "actual_minutes": row.actual_minutes, "status": row.status}


@frappe.whitelist()
def reset_assessment(docname, row_idx):
	doc = frappe.get_doc("Training Assignment", docname)
	row_idx = int(row_idx)

	row = next((r for r in doc.assessments if r.idx == row_idx), None)
	if not row:
		frappe.throw(f"Row {row_idx} not found.")

	row.status = "Not Started"
	row.start_time = None
	row.end_time = None
	row.actual_minutes = 0

	doc.save(ignore_permissions=True)
	frappe.db.commit()

	return {"status": "Not Started"}

@frappe.whitelist()
def get_calendar_events(start, end, filters=None):
	conditions = []
	values = {"start": start, "end": end}

	if filters:
		filters = frappe.parse_json(filters)

		if isinstance(filters, list):
			for f in filters:
				if len(f) >= 3 and f[2]:
					conditions.append(f"ta.`{f[0]}` = %({f[0]})s")
					values[f[0]] = f[2]
		elif isinstance(filters, dict):
			for key in ("department", "employee", "team_leader", "status"):
				if filters.get(key):
					conditions.append(f"ta.`{key}` = %({key})s")
					values[key] = filters[key]

	conditions_str = (" AND " + " AND ".join(conditions)) if conditions else ""

	return frappe.db.sql(f"""
		SELECT
			ta.name,
			ta.assignment_date,
			IFNULL(ta.expected_completion_date, ta.assignment_date) AS expected_completion_date,
			CONCAT(ta.employee_name, '\n', ta.template) AS title,
			ta.status,
			1 AS allDay
		FROM `tabTraining Assignment` ta
		WHERE ta.assignment_date <= %(end)s
			AND IFNULL(ta.expected_completion_date, ta.assignment_date) >= %(start)s
			{conditions_str}
	""", values, as_dict=True)