// Copyright (c) 2026, Mohamed Selim and contributors
// For license information, please see license.txt

frappe.ui.form.on("Monthly Project Feedback", {
	refresh(frm) {
		if (!frm.is_new() && frm.doc.overall_satisfaction <= 0.4) {
			frm.add_custom_button(
				__("Create CAPA"),
				() => {
					frappe.new_doc("CAPA Log", {
						department: "Implementation",
						linked_project: frm.doc.project,
						issue_description:
							"Low monthly satisfaction score (" +
							(frm.doc.overall_satisfaction * 5).toFixed(1) +
							"/5) for project " +
							frm.doc.project_name +
							" in " +
							frm.doc.feedback_month,
						capa_type: "Corrective",
					});
				},
				__("Actions")
			);
		}
	},
});