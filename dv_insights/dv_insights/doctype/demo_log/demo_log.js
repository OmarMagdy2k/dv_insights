// Copyright (c) 2026, Mohamed Selim and contributors
// For license information, please see license.txt

frappe.ui.form.on("Demo Log", {
	refresh(frm) {
		if (!frm.is_new() && !frm.doc.feedback_sent) {
			frm.add_custom_button(
				__("Send Feedback Request"),
				() => {
					frappe.call({
						method: "dv_insights.api.demo.send_feedback_email",
						args: { demo_log: frm.doc.name },
						freeze: true,
						freeze_message: __("Sending feedback request..."),
						callback() {
							frm.reload_doc();
						},
					});
				},
				__("Actions")
			);
		}

		if (!frm.is_new() && frm.doc.feedback_received && !frm.doc.feedback_link) {
			frm.add_custom_button(
				__("Create Demo Feedback"),
				() => {
					frappe.new_doc("Demo Feedback", {
						demo_log: frm.doc.name,
						lead: frm.doc.lead,
					});
				},
				__("Actions")
			);
		}
	},
});