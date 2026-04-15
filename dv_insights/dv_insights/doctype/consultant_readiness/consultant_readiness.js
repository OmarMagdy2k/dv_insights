// Copyright (c) 2026, Mohamed Selim and contributors
// For license information, please see license.txt

frappe.ui.form.on("Consultant Readiness", {
	refresh(frm) {
		if (frm.doc.readiness_tat_days) {
			const color = frm.doc.readiness_tat_days <= 60 ? "green" : "orange";
			frm.dashboard.set_headline(
				__("Readiness TAT: {0} days", [frm.doc.readiness_tat_days]),
				color
			);
		}
	},
});