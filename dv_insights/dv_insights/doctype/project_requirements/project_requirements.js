// Copyright (c) 2026, Mohamed Selim and contributors
// For license information, please see license.txt

frappe.ui.form.on("Project Requirements", {
	refresh(frm) {
		frm.trigger("calculate_bant_score");

		frm.set_query("opportunity", function () {
			return {
				filters: {
					opportunity_from: "Lead",
					party_name: frm.doc.lead || "",
				},
			};
		});

		frm.set_query("customer", function () {
			let filters = {};
			if (frm.doc.lead) {
				filters["lead_name"] = frm.doc.lead;
			}
			// if (frm.doc.opportunity) {
			// 	filters["opportunity_name"] = ["in", [frm.doc.opportunity || ""]];
			// }
			return { filters };
		});

		frm.set_query("quotation", function () {
			return {
				filters: {
					quotation_to: "Lead",
					party_name: frm.doc.lead,
				},
			};
		});

		// Handover actions
		if (
			!frm.is_new() &&
			frm.doc.status === "In Progress" &&
			frm.doc.handover_status !== "Completed"
		) {
			frm.add_custom_button(
				__("Complete Handover"),
				() => {
					if (!frm.doc.handover_date) {
						frappe.msgprint(__("Please set the Handover Date first."));
						return;
					}
					if (!frm.doc.implementation_team) {
						frappe.msgprint(__("Please assign an Implementation Team Lead."));
						return;
					}
					frm.set_value("handover_status", "Completed");
					frm.set_value("status", "Handed Over");
					frm.save();
					frappe.show_alert({
						message: __("Handover completed successfully"),
						indicator: "green",
					});
				},
				__("Actions")
			);
		}
	},

	// BANT field changes → recalculate score
	budget_confirmed(frm) { frm.trigger("calculate_bant_score"); },
	authority_identified(frm) { frm.trigger("calculate_bant_score"); },
	need_validated(frm) { frm.trigger("calculate_bant_score"); },
	timeline_confirmed(frm) { frm.trigger("calculate_bant_score"); },

	calculate_bant_score(frm) {
		const score =
			cint(frm.doc.budget_confirmed) +
			cint(frm.doc.authority_identified) +
			cint(frm.doc.need_validated) +
			cint(frm.doc.timeline_confirmed);

		frm.set_value("qualification_score", score);

		const labels = { 0: "Not Qualified", 1: "Weak", 2: "Moderate", 3: "Strong", 4: "Fully Qualified" };
		frm.set_value("lead_qualification", labels[score] || "");
	},

	// When Lead changes → clear downstream fields
	lead(frm) {
		frm.set_value("opportunity", "");
		frm.set_value("customer", "");
		frm.set_value("quotation", "");
	},

	opportunity(frm) {
		frm.set_value("customer", "");
		frm.set_value("quotation", "");

		if (!frm.doc.opportunity) return;

		frappe.db.get_value(
			"Opportunity",
			frm.doc.opportunity,
			["opportunity_from", "party_name"],
			(r) => {
				if (r && r.opportunity_from === "Customer" && r.party_name) {
					frm.set_value("customer", r.party_name);
				}
				frm.refresh_field("customer");
				frm.refresh_field("quotation");
			}
		);
	},

	customer(frm) {
		frm.set_value("quotation", "");
	},
});