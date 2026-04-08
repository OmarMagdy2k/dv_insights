frappe.views.calendar["Training Assignment"] = {
	field_map: {
		start: "assignment_date",
		end: "expected_completion_date",
		id: "name",
		title: "title",
		allDay: 1,
		status: "status",
	},
	get_events_method: "dv_insights.dv_insights.doctype.training_assignment.training_assignment.get_calendar_events",
	style_map: {
		"Not Started": "default",
		"In Progress": "info",
		"Completed": "success",
		"Cancelled": "danger",
	},
	filters: [
		{
			fieldtype: "Link",
			fieldname: "department",
			options: "Department",
			label: __("Department"),
		},
		{
			fieldtype: "Link",
			fieldname: "employee",
			options: "Employee",
			label: __("Employee"),
		},
		{
			fieldtype: "Link",
			fieldname: "team_leader",
			options: "Employee",
			label: __("Team Leader"),
		},
		{
			fieldtype: "Select",
			fieldname: "status",
			options: ["", "Not Started", "In Progress", "Completed", "Cancelled"],
			label: __("Status"),
		},
	],
};