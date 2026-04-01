// Copyright (c) 2026, Mohamed Selim and contributors
// For license information, please see license.txt

frappe.ui.form.on("Training Configuration", {
	refresh(frm) {
		frm.add_custom_button(
			__("Generate Default Templates"),
			() => {
				frappe.confirm(
					__(
						"This will create default training templates for the departments listed above. " +
						"Existing templates with the same name will be skipped.<br><br>Continue?"
					),
					() => {
						frappe.call({
							method: "dv_insights.api.training.generate_default_templates",
							freeze: true,
							freeze_message: __("Creating default templates..."),
						});
					}
				);
			},
			__("Actions")
		);
	},
});
