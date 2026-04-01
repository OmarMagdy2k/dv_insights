// Copyright (c) 2026, Mohamed Selim and contributors
// For license information, please see license.txt

frappe.ui.form.on("Training Template", {
	refresh(frm) {
		if (!frm.is_new()) {
			frm.add_custom_button(
				__("Create Training Assignment"),
				() => {
					frappe.new_doc("Training Assignment", {
						template: frm.doc.name,
						department: frm.doc.department,
					});
				},
				__("Actions")
			);
		}
	},
});
