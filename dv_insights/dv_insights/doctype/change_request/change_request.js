// Copyright (c) 2026, Mohamed Selim and contributors
// For license information, please see license.txt

frappe.ui.form.on("Change Request", {
	refresh(frm) {
		if (frm.doc.docstatus === 0 && frm.doc.status === "Draft") {
			frm.add_custom_button(
				__("Send for Approval"),
				() => {
					frm.set_value("status", "Pending Approval");
					frm.save();
				},
				__("Actions")
			);
		}

		if (
			frm.doc.docstatus === 1 &&
			frm.doc.status === "Approved" &&
			frm.doc.status !== "Completed"
		) {
			frm.add_custom_button(
				__("Mark Completed"),
				() => {
					frm.set_value("status", "Completed");
					frm.save();
				},
				__("Actions")
			);
		}
	},

	new_end_date(frm) {
		if (frm.doc.original_end_date && frm.doc.new_end_date) {
			const diff = frappe.datetime.get_diff(
				frm.doc.new_end_date,
				frm.doc.original_end_date
			);
			frm.set_value("additional_days", diff);
		}
	},

	revised_budget(frm) {
		if (frm.doc.original_budget && frm.doc.revised_budget) {
			frm.set_value(
				"additional_cost",
				flt(frm.doc.revised_budget) - flt(frm.doc.original_budget)
			);
		}
	},
});