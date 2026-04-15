// Copyright (c) 2026, Mohamed Selim and contributors
// For license information, please see license.txt

frappe.ui.form.on("CAPA Log", {
	refresh(frm) {
		if (!frm.is_new() && frm.doc.status === "Completed") {
			frm.add_custom_button(
				__("Mark as Verified"),
				() => {
					frm.set_value("status", "Verified");
					frm.set_value("verified_by", frappe.session.user);
					frm.set_value("verification_date", frappe.datetime.nowdate());
					frm.save();
				},
				__("Actions")
			);
		}
	},
});