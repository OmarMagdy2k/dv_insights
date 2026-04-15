import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
	"""Add custom fields needed by the new DocTypes.
	Run via: bench --site <site> execute dv_insights.setup.setup_audit_nc_fields.execute
	Or add to after_install in hooks.py.
	"""
	create_custom_fields({
		# ── Demo Feedback: link back to Demo Log ─────────────────────────
		"Demo Feedback": [
			{
				"fieldname": "demo_log",
				"fieldtype": "Link",
				"label": "Demo Log",
				"options": "Demo Log",
				"insert_after": "lead",
				"description": "Linked Demo Log record",
			},
		],
	})

	frappe.db.commit()
	print("✅ Audit NC custom fields created successfully.")