// Copyright (c) 2026, Mohamed Selim and contributors
// For license information, please see license.txt

frappe.ui.form.on("Project Requirements", {
	refresh(frm) {
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
			if (frm.doc.opportunity) {
				filters["opportunity_name"] = ["in", [frm.doc.opportunity || ""]];
			}

			return { filters };
		});

		frm.set_query("quotation", function () {
			let filters = {};

            filters["quotation_to"] = "Lead";
            filters["party_name"] = frm.doc.lead;

			return { filters };
		});
	},

	// When Lead changes → clear downstream fields & re-apply filters
	lead(frm) {
		frm.set_value("opportunity", "");
		frm.set_value("customer", "");
		frm.set_value("quotation", "");
		frm._opportunity_customer = null;
	},

	// When Opportunity changes → auto-fill Customer if it's a Customer-type opportunity,
	// else clear and re-apply filter
	opportunity(frm) {
		frm.set_value("customer", "");
		frm.set_value("quotation", "");
		frm._opportunity_customer = null;

		if (!frm.doc.opportunity) return;

		frappe.db.get_value(
			"Opportunity",
			frm.doc.opportunity,
			["opportunity_from", "party_name"],
			(r) => {
				if (r && r.opportunity_from === "Customer" && r.party_name) {
					frm._opportunity_customer = r.party_name;
					frm.set_value("customer", r.party_name);
				}
				// Refresh query after fetching so the filter is active
				frm.refresh_field("customer");
				frm.refresh_field("quotation");
			}
		);
	},

	// When Customer changes → clear Quotation
	customer(frm) {
		frm.set_value("quotation", "");
	},
});