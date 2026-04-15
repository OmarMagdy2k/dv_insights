// SLA visibility on Lead list view
// Shows SLA status as color indicators for prioritisation

frappe.listview_settings["Lead"] = frappe.listview_settings["Lead"] || {};

const original_get_indicator = frappe.listview_settings["Lead"].get_indicator;

frappe.listview_settings["Lead"].get_indicator = function (doc) {
	// Check SLA status from Communication or first response
	if (doc._sla_status === "Breached") {
		return [__("SLA Breached"), "red", "status,=,Open"];
	}
	if (doc._sla_status === "At Risk") {
		return [__("SLA At Risk"), "orange", "status,=,Open"];
	}

	// Fall back to original indicator if it existed
	if (original_get_indicator) {
		return original_get_indicator(doc);
	}
};

// Add SLA status column formatter
frappe.listview_settings["Lead"].formatters = Object.assign(
	frappe.listview_settings["Lead"].formatters || {},
	{
		status(value, df, doc) {
			if (!doc.creation) return value;

			const created = moment(doc.creation);
			const now = moment();
			const hours_elapsed = now.diff(created, "hours", true);
			const sla_hours = 24; // SLA threshold from sales procedure

			if (doc.status === "Lead" || doc.status === "Open") {
				// Check if there is any first response
				if (hours_elapsed > sla_hours) {
					return value + ' <span class="indicator-pill red" title="SLA Breached: ' +
						Math.round(hours_elapsed) + 'h since creation">SLA</span>';
				} else if (hours_elapsed > sla_hours * 0.75) {
					return value + ' <span class="indicator-pill orange" title="SLA At Risk: ' +
						Math.round(hours_elapsed) + 'h since creation">SLA</span>';
				}
			}
			return value;
		},
	}
);

frappe.listview_settings["Lead"].onload = function (listview) {
	listview.page.add_inner_button(__("SLA Report"), () => {
		frappe.set_route("query-report", "Lead SLA Analysis");
	});
};