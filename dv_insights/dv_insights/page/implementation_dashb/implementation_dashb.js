frappe.pages['implementation-dashb'].on_page_load = function (wrapper) {
	frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Implementation Metrics"),
		single_column: true,
	});
	const dashboard = new ImplementationMetricsDashboard(wrapper);
	$(wrapper).data("impl_metrics", dashboard);
};

frappe.pages["implementation-dashb"].on_page_show = function (wrapper) {
	const dashboard = $(wrapper).data("impl_metrics");
	if (dashboard && dashboard.ready) dashboard.refresh();
};

// ─────────────────────────────────────────────────────────────────────────────

// Period options — label, months back from today
const PERIODS = [
	{ label: __("1M"),     months: 1  },
	{ label: __("3M"),     months: 3  },
	{ label: __("6M"),     months: 6  },
	{ label: __("1Y"),     months: 12 },
	{ label: __("All"),    months: 0  },
	{ label: __("Custom"), months: -1 }, // sentinel for custom range
];
const DEFAULT_PERIOD = 2; // index into PERIODS → 6M
const CUSTOM_PERIOD_IDX = PERIODS.length - 1;

function period_dates(months) {
	const to = frappe.datetime.get_today();
	const from = months === 0
		? "2000-01-01"
		: frappe.datetime.add_months(to, -months);
	return { from_date: from, to_date: to };
}

// ─────────────────────────────────────────────────────────────────────────────

class ImplementationMetricsDashboard {
	constructor(wrapper) {
		this.wrapper = wrapper;
		this.page    = wrapper.page;
		this.ready   = false;
		this.charts  = {};

		// Each chart tracks its own active period index
		this.active_period = {
			"chart-overdue":      DEFAULT_PERIOD,
			"chart-satisfaction": DEFAULT_PERIOD,
			"chart-handover":     DEFAULT_PERIOD,
			"chart-ready":        DEFAULT_PERIOD,
		};

		// Custom date ranges per chart
		this.custom_dates = {
			"chart-overdue":      { from_date: null, to_date: null },
			"chart-satisfaction": { from_date: null, to_date: null },
			"chart-handover":     { from_date: null, to_date: null },
			"chart-ready":        { from_date: null, to_date: null },
		};

		this._inject_styles();
		this._render_layout();
		this._bind_period_buttons();
		this._init_date_pickers();

		this._load_echarts().then(() => {
			this.ready = true;
			this.refresh();
		});
	}

	// ── ECharts ──────────────────────────────────────────────────────────────

	_load_echarts() {
		return new Promise((resolve) => {
			if (window.echarts) return resolve();
			const s    = document.createElement("script");
			s.src      = "https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js";
			s.onload   = resolve;
			s.onerror  = () => { console.error("ECharts CDN failed"); resolve(); };
			document.head.appendChild(s);
		});
	}

	// ── Period Buttons ────────────────────────────────────────────────────────

	_period_html(chart_id) {
		const buttons = PERIODS.map((p, i) =>
			`<button class="period-btn${i === DEFAULT_PERIOD ? " active" : ""}"
			         data-chart="${chart_id}"
			         data-idx="${i}">${p.label}</button>`
		).join("");

		const date_row = `
			<div class="custom-date-row" data-chart="${chart_id}" style="display:none;">
				<div class="cdr-from" data-chart="${chart_id}"></div>
				<span class="custom-date-sep">→</span>
				<div class="cdr-to" data-chart="${chart_id}"></div>
				<button class="btn btn-xs btn-primary-dark custom-date-apply"
				        data-chart="${chart_id}">${__("Apply")}</button>
			</div>
		`;

		return `<div class="period-controls" data-chart="${chart_id}">
			<div class="period-selector">${buttons}</div>
			${date_row}
		</div>`;
	}

	_bind_period_buttons() {
		$(this.page.body).on("click", ".period-btn", (e) => {
			const $btn     = $(e.currentTarget);
			const chart_id = $btn.data("chart");
			const idx      = parseInt($btn.data("idx"));

			// Update active state
			$(this.page.body)
				.find(`.period-btn[data-chart="${chart_id}"]`)
				.removeClass("active");
			$btn.addClass("active");

			this.active_period[chart_id] = idx;

			// Toggle custom date row
			const $date_row = $(this.page.body).find(`.custom-date-row[data-chart="${chart_id}"]`);
			if (idx === CUSTOM_PERIOD_IDX) {
				$date_row.slideDown(150);
				// Don't fetch yet — wait for Apply
				return;
			} else {
				$date_row.slideUp(150);
			}

			if (this.ready) this._fetch_chart(chart_id);
		});
	}

	_init_date_pickers() {
		this._pickers = {};
		const chart_ids = ["chart-overdue", "chart-satisfaction", "chart-handover", "chart-ready"];
		const $body = $(this.page.body);

		chart_ids.forEach((chart_id) => {
			this._pickers[chart_id] = {};

			const from_ctrl = frappe.ui.form.make_control({
				df: {
					fieldname: `custom_from_${chart_id}`,
					fieldtype: "Date",
					placeholder: __("From Date"),
					input_class: "input-xs",
				},
				parent: $body.find(`.cdr-from[data-chart="${chart_id}"]`),
				only_input: true,
				render_input: true,
			});
			from_ctrl.$input.attr("placeholder", __("From Date"));
			this._pickers[chart_id].from_ctrl = from_ctrl;

			const to_ctrl = frappe.ui.form.make_control({
				df: {
					fieldname: `custom_to_${chart_id}`,
					fieldtype: "Date",
					placeholder: __("To Date"),
					input_class: "input-xs",
				},
				parent: $body.find(`.cdr-to[data-chart="${chart_id}"]`),
				only_input: true,
				render_input: true,
			});
			to_ctrl.$input.attr("placeholder", __("To Date"));
			this._pickers[chart_id].to_ctrl = to_ctrl;
		});

		// Apply button
		$body.on("click", ".custom-date-apply", (e) => {
			const chart_id = $(e.currentTarget).data("chart");
			this._apply_custom_dates(chart_id);
		});
	}

	_apply_custom_dates(chart_id) {
		const pickers = this._pickers[chart_id] || {};
		const from_val = pickers.from_ctrl?.get_value?.();
		const to_val   = pickers.to_ctrl?.get_value?.();

		if (!from_val || !to_val) {
			frappe.show_alert({ message: __("Please select both From and To dates"), indicator: "orange" });
			return;
		}

		if (from_val > to_val) {
			frappe.show_alert({ message: __("From Date cannot be after To Date"), indicator: "red" });
			return;
		}

		this.custom_dates[chart_id] = { from_date: from_val, to_date: to_val };
		if (this.ready) this._fetch_chart(chart_id);
	}

	_dates_for(chart_id) {
		const idx = this.active_period[chart_id] ?? DEFAULT_PERIOD;

		// Custom range
		if (idx === CUSTOM_PERIOD_IDX) {
			const cd = this.custom_dates[chart_id];
			if (cd.from_date && cd.to_date) {
				return { from_date: cd.from_date, to_date: cd.to_date };
			}
			// Fallback to 6M if no custom dates set yet
			return period_dates(PERIODS[DEFAULT_PERIOD].months);
		}

		return period_dates(PERIODS[idx].months);
	}

	// ── Layout ────────────────────────────────────────────────────────────────

	_render_layout() {
		$(this.page.body).html(`
			<div class="impl-dashboard">

				<!-- KPI Cards -->
				<div class="kpi-row">
					<div class="kpi-card">
						<div class="kpi-icon">📋</div>
						<div class="kpi-body">
							<div class="kpi-label">${__("Overdue Tasks")}</div>
							<div class="kpi-value" id="kpi-overdue-val">—</div>
							<div class="kpi-sub"   id="kpi-overdue-sub"></div>
						</div>
						<div class="kpi-badge" id="kpi-overdue-badge"></div>
					</div>

					<div class="kpi-card">
						<div class="kpi-icon">⭐</div>
						<div class="kpi-body">
							<div class="kpi-label">${__("Avg Satisfaction Score")}</div>
							<div class="kpi-value" id="kpi-sat-val">—</div>
							<div class="kpi-sub"   id="kpi-sat-sub"></div>
						</div>
						<div class="kpi-badge" id="kpi-sat-badge"></div>
					</div>

					<div class="kpi-card">
						<div class="kpi-icon">🔁</div>
						<div class="kpi-body">
							<div class="kpi-label">${__("Avg Handover TAT")}</div>
							<div class="kpi-value" id="kpi-handover-val">—</div>
							<div class="kpi-sub"   id="kpi-handover-sub"></div>
						</div>
						<div class="kpi-badge" id="kpi-handover-badge"></div>
					</div>

					<div class="kpi-card">
						<div class="kpi-icon">🎓</div>
						<div class="kpi-body">
							<div class="kpi-label">${__("Avg Joining → Ready TAT")}</div>
							<div class="kpi-value" id="kpi-ready-val">—</div>
							<div class="kpi-sub"   id="kpi-ready-sub"></div>
						</div>
						<div class="kpi-badge" id="kpi-ready-badge"></div>
					</div>
				</div>

				<!-- Charts Row 1 -->
				<div class="charts-row">
					<div class="chart-card">
						<div class="chart-header">
							<span class="chart-title">${__("% Overdue Tasks by Project")}</span>
							${this._period_html("chart-overdue")}
						</div>
						<div class="chart-body" id="chart-overdue"></div>
					</div>

					<div class="chart-card">
						<div class="chart-header">
							<span class="chart-title">${__("Satisfaction Score Trend")}</span>
							${this._period_html("chart-satisfaction")}
						</div>
						<div class="chart-body" id="chart-satisfaction"></div>
					</div>
				</div>

				<!-- Charts Row 2 -->
				<div class="charts-row">
					<div class="chart-card">
						<div class="chart-header">
							<span class="chart-title">${__("Handover TAT per Project")}</span>
							${this._period_html("chart-handover")}
						</div>
						<div class="chart-body" id="chart-handover"></div>
					</div>

					<div class="chart-card">
						<div class="chart-header">
							<span class="chart-title">${__("Joining → Ready TAT per Consultant")}</span>
							${this._period_html("chart-ready")}
						</div>
						<div class="chart-body" id="chart-ready"></div>
					</div>
				</div>

			</div>
		`);
	}

	// ── Refresh all charts ────────────────────────────────────────────────────

	refresh() {
		this._set_loading(true);
		Promise.all([
			this._fetch_chart("chart-overdue"),
			this._fetch_chart("chart-satisfaction"),
			this._fetch_chart("chart-handover"),
			this._fetch_chart("chart-ready"),
		])
		.catch((err) => {
			console.error("Implementation Metrics error:", err);
			frappe.msgprint(__("Error loading metrics. Check console."));
		})
		.finally(() => this._set_loading(false));
	}

	// ── Per-chart fetch ───────────────────────────────────────────────────────

	_fetch_chart(chart_id) {
		const { from_date, to_date } = this._dates_for(chart_id);

		switch (chart_id) {
			case "chart-overdue":
				return this._call("get_overdue_tasks_data", { from_date, to_date })
					.then((d) => this._update_overdue(d));

			case "chart-satisfaction":
				return this._call("get_satisfaction_data", { from_date, to_date })
					.then((d) => this._update_satisfaction(d));

			case "chart-handover":
				return this._call("get_handover_tat_data", { from_date, to_date })
					.then((d) => this._update_handover(d));

			case "chart-ready":
				return this._call("get_joining_ready_tat_data", { from_date, to_date })
					.then((d) => this._update_ready(d));
		}
	}

	// ── KPI + Chart Updaters ─────────────────────────────────────────────────

	_update_overdue(data) {
		const kpi   = data.kpi || {};
		const val   = flt(kpi.value, 1);
		const color = val > 20 ? "red" : val > 10 ? "orange" : "green";

		this._set_kpi("kpi-overdue-val", val + "%");
		this._set_kpi("kpi-overdue-sub", `${kpi.overdue || 0} overdue / ${kpi.total || 0} total`);
		this._set_badge("kpi-overdue-badge",
			val > 20 ? __("High Risk") : val > 10 ? __("Watch") : __("On Track"), color);

		const c = data.chart || {};
		if (!c.projects?.length) { this._show_empty("chart-overdue"); return; }
		this._render_bar("chart-overdue", {
			categories: c.projects,
			values:     c.overdue_pcts,
			seriesName: __("% Overdue"),
			color:      "#F97316",
			yLabel:     "%",
			markLine:   { value: 20, label: "20% Threshold" },
		});
	}

	_update_satisfaction(data) {
		const kpi   = data.kpi || {};
		const val   = flt(kpi.value, 2);
		const color = val >= 4 ? "green" : val >= 3 ? "orange" : "red";

		this._set_kpi("kpi-sat-val", val + " / 5");
		this._set_kpi("kpi-sat-sub", `${kpi.total_responses || 0} responses`);
		this._set_badge("kpi-sat-badge",
			val >= 4 ? __("Excellent") : val >= 3 ? __("Good") : __("Needs RCA"), color);

		const c = data.chart || {};
		if (!c.months?.length) { this._show_empty("chart-satisfaction"); return; }
		this._render_line("chart-satisfaction", {
			categories: c.months,
			values:     c.scores,
			seriesName: __("Avg Score"),
			color:      "#3B82F6",
			yMin: 0, yMax: 5,
			yLabel:   __("Score"),
			markLine: { value: 4, label: "Target (4.0)" },
		});
	}

	_update_handover(data) {
		const kpi   = data.kpi || {};
		const val   = flt(kpi.value, 1);
		const color = val > 30 ? "red" : val > 14 ? "orange" : "green";

		this._set_kpi("kpi-handover-val", val + " " + __("days"));
		this._set_kpi("kpi-handover-sub", `${kpi.total_projects || 0} projects`);
		this._set_badge("kpi-handover-badge",
			val > 30 ? __("Delayed") : val > 14 ? __("Moderate") : __("Fast"), color);

		const c = data.chart || {};
		if (!c.projects?.length) { this._show_empty("chart-handover"); return; }
		this._render_bar("chart-handover", {
			categories: c.projects,
			values:     c.tats,
			seriesName: __("TAT (days)"),
			color:      "#8B5CF6",
			yLabel:     __("Days"),
			markLine:   { value: 14, label: "14-day target" },
		});
	}

	_update_ready(data) {
		const kpi   = data.kpi || {};
		const val   = flt(kpi.value, 1);
		const color = val > 60 ? "red" : val > 30 ? "orange" : "green";

		this._set_kpi("kpi-ready-val", val + " " + __("days"));
		this._set_kpi("kpi-ready-sub", `${kpi.total_consultants || 0} consultants`);
		this._set_badge("kpi-ready-badge",
			val > 60 ? __("Slow") : val > 30 ? __("Moderate") : __("Fast"), color);

		const c = data.chart || {};
		if (!c.employees?.length) { this._show_empty("chart-ready"); return; }
		this._render_bar("chart-ready", {
			categories: c.employees,
			values:     c.tats,
			seriesName: __("TAT (days)"),
			color:      "#10B981",
			yLabel:     __("Days"),
			markLine:   { value: 30, label: "30-day target" },
		});
	}

	// ── Chart Renderers ───────────────────────────────────────────────────────

	_get_chart_el(id) {
		return $(this.page.body).find(`#${id}`)[0];
	}

	_render_bar(id, { categories, values, seriesName, color, yLabel, markLine }) {
		if (!window.echarts) { this._show_empty(id); return; }
		const el = this._get_chart_el(id);
		if (!el) return;

		if (this.charts[id]) { this.charts[id].dispose(); delete this.charts[id]; }
		const chart = echarts.init(el, null, { renderer: "canvas" });
		this.charts[id] = chart;

		chart.setOption({
			backgroundColor: "transparent",
			tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
			grid: { left: 48, right: 16, top: 16, bottom: 56, containLabel: false },
			xAxis: {
				type: "category",
				data: categories,
				axisLabel: {
					rotate: categories.length > 5 ? 35 : 0,
					overflow: "truncate", width: 80,
					fontSize: 11, color: "#8D99A6",
				},
				axisLine: { lineStyle: { color: "#E2E8F0" } },
				axisTick: { show: false },
			},
			yAxis: {
				type: "value", name: yLabel,
				nameTextStyle: { color: "#8D99A6", fontSize: 11 },
				axisLabel: { color: "#8D99A6", fontSize: 11 },
				splitLine: { lineStyle: { color: "#E2E8F0", type: "dashed" } },
			},
			series: [{
				name: seriesName, type: "bar", data: values, barMaxWidth: 48,
				itemStyle: { color, borderRadius: [4, 4, 0, 0] },
				emphasis: { itemStyle: { opacity: 0.8 } },
				markLine: markLine ? {
					silent: true, symbol: ["none", "none"],
					lineStyle: { color: "#EF4444", type: "dashed", width: 1.5 },
					data: [{ yAxis: markLine.value, name: markLine.label }],
					label: { position: "insideEndTop", formatter: markLine.label, color: "#EF4444", fontSize: 10 },
				} : undefined,
			}],
		});
	}

	_render_line(id, { categories, values, seriesName, color, yMin, yMax, yLabel, markLine }) {
		if (!window.echarts) { this._show_empty(id); return; }
		const el = this._get_chart_el(id);
		if (!el) return;

		if (this.charts[id]) { this.charts[id].dispose(); delete this.charts[id]; }
		const chart = echarts.init(el, null, { renderer: "canvas" });
		this.charts[id] = chart;

		chart.setOption({
			backgroundColor: "transparent",
			tooltip: { trigger: "axis" },
			grid: { left: 48, right: 16, top: 16, bottom: 56, containLabel: false },
			xAxis: {
				type: "category", data: categories,
				axisLabel: { rotate: categories.length > 6 ? 35 : 0, fontSize: 11, color: "#8D99A6" },
				axisLine: { lineStyle: { color: "#E2E8F0" } },
				axisTick: { show: false },
			},
			yAxis: {
				type: "value", name: yLabel, min: yMin, max: yMax,
				nameTextStyle: { color: "#8D99A6", fontSize: 11 },
				axisLabel: { color: "#8D99A6", fontSize: 11 },
				splitLine: { lineStyle: { color: "#E2E8F0", type: "dashed" } },
			},
			series: [{
				name: seriesName, type: "line", data: values,
				smooth: true, symbol: "circle", symbolSize: 7,
				lineStyle: { color, width: 2.5 },
				itemStyle: { color },
				areaStyle: {
					color: {
						type: "linear", x: 0, y: 0, x2: 0, y2: 1,
						colorStops: [
							{ offset: 0, color: color + "33" },
							{ offset: 1, color: color + "00" },
						],
					},
				},
				markLine: markLine ? {
					silent: true, symbol: ["none", "none"],
					lineStyle: { color: "#10B981", type: "dashed", width: 1.5 },
					data: [{ yAxis: markLine.value, name: markLine.label }],
					label: { position: "insideEndTop", formatter: markLine.label, color: "#10B981", fontSize: 10 },
				} : undefined,
			}],
		});
	}

	// ── Helpers ───────────────────────────────────────────────────────────────

	_call(method, args) {
		return new Promise((resolve, reject) => {
			frappe.call({
				method: `dv_insights.api.implementation_metrics.${method}`,
				args,
				callback: (r) => resolve((r && r.message) ? r.message : { kpi: {}, chart: {} }),
				error: reject,
			});
		});
	}

	_set_kpi(id, text) {
		const el = $(this.page.body).find(`#${id}`)[0];
		if (el) el.textContent = text;
	}

	_set_badge(id, text, color) {
		const el = $(this.page.body).find(`#${id}`)[0];
		if (!el) return;
		el.textContent = text;
		el.setAttribute("data-color", color);
	}

	_show_empty(id) {
		const el = this._get_chart_el(id);
		if (el) el.innerHTML = `<div class="chart-empty">${__("No data for selected period")}</div>`;
	}

	_set_loading(loading) {
		const el = $(this.page.body).find(".impl-dashboard")[0];
		if (el) el.classList.toggle("loading", loading);
	}

	// ── Styles ────────────────────────────────────────────────────────────────

	_inject_styles() {
		if (document.getElementById("impl-metrics-styles")) return;
		const style = document.createElement("style");
		style.id = "impl-metrics-styles";
		style.textContent = `
			.impl-dashboard {
				padding: 20px 24px 40px;
				transition: opacity 0.2s ease;
			}
			.impl-dashboard.loading { opacity: 0.4; pointer-events: none; }

			/* KPI Row */
			.kpi-row {
				display: grid;
				grid-template-columns: repeat(4, 1fr);
				gap: 16px;
				margin-bottom: 24px;
			}
			@media (max-width: 1100px) { .kpi-row { grid-template-columns: repeat(2, 1fr); } }
			@media (max-width: 640px)  { .kpi-row { grid-template-columns: 1fr; } }

			.kpi-card {
				background: var(--card-bg);
				border: 1px solid var(--border-color);
				border-radius: 10px;
				padding: 18px 20px 14px;
				display: flex;
				align-items: flex-start;
				gap: 14px;
				position: relative;
				transition: box-shadow 0.18s ease;
			}
			.kpi-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.08); }
			.kpi-icon { font-size: 26px; line-height: 1; margin-top: 2px; flex-shrink: 0; }
			.kpi-body { flex: 1; min-width: 0; }
			.kpi-label {
				font-size: 11px; font-weight: 500;
				text-transform: uppercase; letter-spacing: 0.05em;
				color: var(--text-muted); margin-bottom: 4px;
			}
			.kpi-value {
				font-size: 28px; font-weight: 700;
				color: var(--text-color); line-height: 1.1; margin-bottom: 4px;
			}
			.kpi-sub { font-size: 11px; color: var(--text-muted); }
			.kpi-badge {
				position: absolute; top: 12px; right: 12px;
				font-size: 10px; font-weight: 600;
				padding: 2px 8px; border-radius: 20px;
				text-transform: uppercase; letter-spacing: 0.04em;
			}
			.kpi-badge[data-color="green"]  { background: #D1FAE5; color: #065F46; }
			.kpi-badge[data-color="orange"] { background: #FEF3C7; color: #92400E; }
			.kpi-badge[data-color="red"]    { background: #FEE2E2; color: #991B1B; }

			/* Charts */
			.charts-row {
				display: grid;
				grid-template-columns: 1fr 1fr;
				gap: 16px; margin-bottom: 16px;
			}
			@media (max-width: 900px) { .charts-row { grid-template-columns: 1fr; } }

			.chart-card {
				background: var(--card-bg);
				border: 1px solid var(--border-color);
				border-radius: 10px;
				padding: 16px 20px 12px;
			}
			.chart-header {
				display: flex; align-items: flex-start;
				justify-content: space-between; margin-bottom: 14px;
				flex-wrap: wrap; gap: 8px;
			}
			.chart-title {
				font-size: 13px; font-weight: 600;
				color: var(--text-color);
				padding-top: 4px;
			}

			/* Period Controls — wrapper for selector + custom date row */
			.period-controls {
				display: flex;
				flex-direction: column;
				align-items: flex-end;
				gap: 6px;
			}

			/* Period Selector — Frappe-style pill buttons */
			.period-selector {
				display: flex;
				gap: 2px;
				background: var(--control-bg);
				border: 1px solid var(--border-color);
				border-radius: 6px;
				padding: 2px;
			}
			.period-btn {
				background: transparent;
				border: none;
				border-radius: 4px;
				padding: 3px 9px;
				font-size: 11px;
				font-weight: 500;
				color: var(--text-muted);
				cursor: pointer;
				transition: background 0.15s, color 0.15s;
				line-height: 1.4;
			}
			.period-btn:hover { background: var(--fg-hover-color); color: var(--text-color); }
			.period-btn.active {
				background: var(--card-bg);
				color: var(--text-color);
				font-weight: 600;
				box-shadow: 0 1px 3px rgba(0,0,0,0.1);
			}

			/* Custom Date Range Row */
			.custom-date-row {
				display: flex;
				align-items: center;
				gap: 6px;
				flex-wrap: nowrap;
			}
			.custom-date-row .cdr-from,
			.custom-date-row .cdr-to {
				flex-shrink: 0;
			}
			/* Style the Frappe-generated input inside date controls */
			.custom-date-row .cdr-from .frappe-control,
			.custom-date-row .cdr-to .frappe-control {
				margin: 0 !important;
				padding: 0 !important;
			}
			.custom-date-row .cdr-from .frappe-control .like-disabled-input,
			.custom-date-row .cdr-to .frappe-control .like-disabled-input {
				display: none !important;
			}
			.custom-date-row .cdr-from input,
			.custom-date-row .cdr-to input {
				width: 110px !important;
				height: 26px !important;
				padding: 2px 8px !important;
				font-size: 11px !important;
				border: 1px solid var(--border-color) !important;
				border-radius: 4px !important;
				background: var(--control-bg) !important;
				color: var(--text-color) !important;
			}
			.custom-date-row .cdr-from input:focus,
			.custom-date-row .cdr-to input:focus {
				border-color: var(--primary) !important;
				outline: none !important;
				box-shadow: 0 0 0 2px rgba(44,120,220,0.15) !important;
			}
			.custom-date-sep {
				font-size: 12px;
				color: var(--text-muted);
				flex-shrink: 0;
			}
			.custom-date-apply {
				height: 26px;
				padding: 2px 12px;
				font-size: 11px;
				font-weight: 600;
				border-radius: 4px;
				white-space: nowrap;
			}

			/* Ensure Frappe datepicker dropdown is above chart cards */
			.datepicker {
				z-index: 1050 !important;
			}

			.chart-body { height: 260px; width: 100%; }
			.chart-empty {
				height: 260px; display: flex;
				align-items: center; justify-content: center;
				color: var(--text-muted); font-size: 13px;
			}
		`;
		document.head.appendChild(style);
	}
}