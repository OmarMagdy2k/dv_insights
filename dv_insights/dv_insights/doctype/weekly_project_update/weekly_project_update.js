// Copyright (c) 2026, Mohamed Selim and contributors
// For license information, please see license.txt

frappe.ui.form.on("Weekly Project Update", {
	refresh(frm) {
		if (frm.doc.is_delayed ) {
			frm.dashboard.set_headline(
				__("Delay has NOT been discussed the updates yet!"),
				"red"
			);
		}
	},

	project(frm) {
		if (frm.doc.project) {
			frappe.db.get_value("Project", frm.doc.project, ["expected_end_date"], (r) => {
				if (r && r.expected_end_date) {
					frm.set_value("original_end_date", r.expected_end_date);
				}
			});
		}
	},
});