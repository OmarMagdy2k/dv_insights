frappe.listview_settings["Training Template"] = {
	add_fields: ["is_default", "department", "total_items", "total_expected_minutes"],

	get_indicator(doc) {
		if (doc.is_default) {
			return [__("Default"), "blue", "is_default,=,1"];
		}
		return [__("Custom"), "gray", "is_default,=,0"];
	},

	formatters: {
		total_expected_minutes(val) {
			if (!val) return "";
			const hrs = Math.floor(val / 60);
			const mins = val % 60;
			if (hrs > 0) {
				return `<span style="font-weight:600;">${hrs}h ${mins}m</span>`;
			}
			return `<span style="font-weight:600;">${mins}m</span>`;
		},
	},
};
