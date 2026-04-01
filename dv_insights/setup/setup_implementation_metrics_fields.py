import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
    create_custom_fields({
        # ── Project ──────────────────────────────────────────────────────────
        "Project": [
            {
                "fieldname": "implementation_metrics_section",
                "fieldtype": "Section Break",
                "label": "Implementation Metrics",
                "insert_after": "notes",
                "collapsible": 1,
            },
            {
                "fieldname": "implementation_handover_date",
                "fieldtype": "Date",
                "label": "Implementation Handover Date",
                "description": "Date the implementation team formally handed off the project",
                "insert_after": "implementation_metrics_section",
            },
            {
                "fieldname": "support_ownership_date",
                "fieldtype": "Date",
                "label": "Support Ownership Date",
                "description": "Date the support team took full ownership",
                "insert_after": "implementation_handover_date",
            },
            {
                "fieldname": "handover_tat_days",
                "fieldtype": "Int",
                "label": "Handover TAT (Days)",
                "read_only": 1,
                "description": "Auto-calculated: Support Ownership Date − Implementation Handover Date",
                "insert_after": "support_ownership_date",
            },
        ],
        ## No Longer Used , Metrics now tracked from Training Assignment doctype
        # # ── Employee ─────────────────────────────────────────────────────────
        # "Employee": [
        #     {
        #         "fieldname": "implementation_readiness_section",
        #         "fieldtype": "Section Break",
        #         "label": "Implementation Readiness",
        #         "insert_after": "date_of_joining",
        #         "collapsible": 1,
        #     },
        #     {
        #         "fieldname": "implementation_ready_date",
        #         "fieldtype": "Date",
        #         "label": "Implementation Ready Date",
        #         "description": "Date consultant completed training/evaluation and was cleared for projects",
        #         "insert_after": "implementation_readiness_section",
        #     },
        #     {
        #         "fieldname": "joining_to_ready_tat_days",
        #         "fieldtype": "Int",
        #         "label": "Joining to Ready TAT (Days)",
        #         "read_only": 1,
        #         "description": "Auto-calculated: Implementation Ready Date − Date of Joining",
        #         "insert_after": "implementation_ready_date",
        #     },
        # ],
        # # ── CRM Deal ─────────────────────────────────────────────────────────
        "CRM Deal": [
            {
                "fieldname": "implementation_handover_date",
                "fieldtype": "Date",
                "label": "Implementation Handover Date",
                "description": "Date the Sales team formally handed off the deal to the implementation team",
                "insert_after": "closed_date",
            },
        ],
    })

    frappe.db.commit()
    print("✅ Custom fields created successfully.")