frappe.pages["sales-dashboard"].on_page_load = function (wrapper) {
	frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Sales Metrics Dashboard"),
		single_column: true,
	});
	const dashboard = new SalesMetricsDashboard(wrapper);
	$(wrapper).data("sales_metrics", dashboard);
};

frappe.pages["sales-dashboard"].on_page_show = function (wrapper) {
	const dashboard = $(wrapper).data("sales_metrics");
	if (dashboard && dashboard.ready) dashboard.refresh();
};

// ─────────────────────────────────────────────────────────────────────────────
// Period Selector Config
// ─────────────────────────────────────────────────────────────────────────────

const PERIODS = [
	{ label: __("1M"),     months: 1  },
	{ label: __("3M"),     months: 3  },
	{ label: __("6M"),     months: 6  },
	{ label: __("1Y"),     months: 12 },
	{ label: __("All"),    months: 0  },
	{ label: __("Custom"), months: -1 },
];
const DEFAULT_PERIOD = 2; // 6M
const CUSTOM_PERIOD_IDX = PERIODS.length - 1;

function period_dates(months) {
	const to = frappe.datetime.get_today();
	const from = months === 0
		? "2000-01-01"
		: frappe.datetime.add_months(to, -months);
	return { from_date: from, to_date: to };
}

// ─────────────────────────────────────────────────────────────────────────────
// Chart IDs
// ─────────────────────────────────────────────────────────────────────────────

const CHART_IDS = [
	"chart-tat",
	"chart-sla",
	"chart-conversion",
	"chart-feedback",
	"chart-ready",
];

// ─────────────────────────────────────────────────────────────────────────────

class SalesMetricsDashboard {
	constructor(wrapper) {
		this.wrapper = wrapper;
		this.page    = wrapper.page;
		this.ready   = false;
		this.charts  = {};

		this.active_period = {};
		this.custom_dates  = {};
		CHART_IDS.forEach((id) => {
			this.active_period[id] = DEFAULT_PERIOD;
			this.custom_dates[id]  = { from_date: null, to_date: null };
		});

		this._inject_styles();
		this._render_layout();
		this._bind_period_buttons();
		this._init_date_pickers();

		this._load_echarts().then(() => {
			this.ready = true;
			this.refresh();
		});

		// Resize charts on window resize
		$(window).on("resize.sales_metrics", () => {
			Object.values(this.charts).forEach((c) => c.resize?.());
		});
	}

	// ── ECharts ──────────────────────────────────────────────────────────────

	_load_echarts() {
		return new Promise((resolve) => {
			if (window.echarts) return resolve();
			const s   = document.createElement("script");
			s.src     = "https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js";
			s.onload  = resolve;
			s.onerror = () => { console.error("ECharts CDN failed"); resolve(); };
			document.head.appendChild(s);
		});
	}

	// ── Period Controls ──────────────────────────────────────────────────────

	_period_html(chart_id) {
		const buttons = PERIODS.map((p, i) =>
			`<button class="period-btn${i === DEFAULT_PERIOD ? " active" : ""}"
			         data-chart="${chart_id}" data-idx="${i}">${p.label}</button>`
		).join("");

		return `
		<div class="period-controls" data-chart="${chart_id}">
			<div class="period-selector">${buttons}</div>
			<div class="custom-date-row" data-chart="${chart_id}" style="display:none;">
				<div class="cdr-from" data-chart="${chart_id}"></div>
				<span class="custom-date-sep">→</span>
				<div class="cdr-to" data-chart="${chart_id}"></div>
				<button class="btn btn-xs btn-primary-dark custom-date-apply"
				        data-chart="${chart_id}">${__("Apply")}</button>
			</div>
		</div>`;
	}

	_bind_period_buttons() {
		$(this.page.body).on("click", ".period-btn", (e) => {
			const $btn     = $(e.currentTarget);
			const chart_id = $btn.data("chart");
			const idx      = parseInt($btn.data("idx"));

			$(this.page.body)
				.find(`.period-btn[data-chart="${chart_id}"]`)
				.removeClass("active");
			$btn.addClass("active");

			this.active_period[chart_id] = idx;

			const $row = $(this.page.body).find(`.custom-date-row[data-chart="${chart_id}"]`);
			if (idx === CUSTOM_PERIOD_IDX) {
				$row.slideDown(150);
				return;
			} else {
				$row.slideUp(150);
			}

			if (this.ready) this._fetch_chart(chart_id);
		});
	}

	_init_date_pickers() {
		this._pickers = {};
		const $body = $(this.page.body);

		CHART_IDS.forEach((chart_id) => {
			this._pickers[chart_id] = {};

			["from", "to"].forEach((dir) => {
				const ctrl = frappe.ui.form.make_control({
					df: {
						fieldname: `custom_${dir}_${chart_id}`,
						fieldtype: "Date",
						placeholder: dir === "from" ? __("From Date") : __("To Date"),
						input_class: "input-xs",
					},
					parent: $body.find(`.cdr-${dir}[data-chart="${chart_id}"]`),
					only_input: true,
					render_input: true,
				});
				ctrl.$input.attr("placeholder", dir === "from" ? __("From Date") : __("To Date"));
				this._pickers[chart_id][`${dir}_ctrl`] = ctrl;
			});
		});

		$body.on("click", ".custom-date-apply", (e) => {
			const chart_id = $(e.currentTarget).data("chart");
			const pickers  = this._pickers[chart_id] || {};
			const from_val = pickers.from_ctrl?.get_value?.();
			const to_val   = pickers.to_ctrl?.get_value?.();

			if (!from_val || !to_val) {
				frappe.show_alert({ message: __("Select both dates"), indicator: "orange" });
				return;
			}
			if (from_val > to_val) {
				frappe.show_alert({ message: __("From Date cannot be after To Date"), indicator: "red" });
				return;
			}

			this.custom_dates[chart_id] = { from_date: from_val, to_date: to_val };
			if (this.ready) this._fetch_chart(chart_id);
		});
	}

	_dates_for(chart_id) {
		const idx = this.active_period[chart_id] ?? DEFAULT_PERIOD;
		if (idx === CUSTOM_PERIOD_IDX) {
			const cd = this.custom_dates[chart_id];
			if (cd.from_date && cd.to_date) return cd;
			return period_dates(PERIODS[DEFAULT_PERIOD].months);
		}
		return period_dates(PERIODS[idx].months);
	}

	// ── Layout ───────────────────────────────────────────────────────────────

	_render_layout() {
		$(this.page.body).html(`
		<div class="sales-dashboard">

			<!-- KPI Cards -->
			<div class="kpi-row kpi-row-5">
				<div class="kpi-card">
					<div class="kpi-icon">🔁</div>
					<div class="kpi-body">
						<div class="kpi-label">${__("Sales → Impl TAT")}</div>
						<div class="kpi-value" id="kpi-tat-val">—</div>
						<div class="kpi-sub"   id="kpi-tat-sub"></div>
					</div>
					<div class="kpi-badge" id="kpi-tat-badge"></div>
				</div>

				<div class="kpi-card">
					<div class="kpi-icon">📞</div>
					<div class="kpi-body">
						<div class="kpi-label">${__("Lead Response SLA")}</div>
						<div class="kpi-value" id="kpi-sla-val">—</div>
						<div class="kpi-sub"   id="kpi-sla-sub"></div>
					</div>
					<div class="kpi-badge" id="kpi-sla-badge"></div>
				</div>

				<div class="kpi-card">
					<div class="kpi-icon">📈</div>
					<div class="kpi-body">
						<div class="kpi-label">${__("Conversion Rate")}</div>
						<div class="kpi-value" id="kpi-conv-val">—</div>
						<div class="kpi-sub"   id="kpi-conv-sub"></div>
					</div>
					<div class="kpi-badge" id="kpi-conv-badge"></div>
				</div>

				<div class="kpi-card">
					<div class="kpi-icon">⭐</div>
					<div class="kpi-body">
						<div class="kpi-label">${__("Demo Feedback Score")}</div>
						<div class="kpi-value" id="kpi-fb-val">—</div>
						<div class="kpi-sub"   id="kpi-fb-sub"></div>
					</div>
					<div class="kpi-badge" id="kpi-fb-badge"></div>
				</div>

				<div class="kpi-card">
					<div class="kpi-icon">🎓</div>
					<div class="kpi-body">
						<div class="kpi-label">${__("Joining → Ready TAT")}</div>
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
						<span class="chart-title">${__("Sales → Implementation TAT per Deal")}</span>
						${this._period_html("chart-tat")}
					</div>
					<div class="chart-body" id="chart-tat"></div>
				</div>

				<div class="chart-card">
					<div class="chart-header">
						<span class="chart-title">${__("Lead Response SLA Trend")}</span>
						${this._period_html("chart-sla")}
					</div>
					<div class="chart-body" id="chart-sla"></div>
				</div>
			</div>

			<!-- Charts Row 2 -->
			<div class="charts-row">
				<div class="chart-card">
					<div class="chart-header">
						<span class="chart-title">${__("Opportunity → Conversion Rate Trend")}</span>
						${this._period_html("chart-conversion")}
					</div>
					<div class="chart-body" id="chart-conversion"></div>
				</div>

				<div class="chart-card">
					<div class="chart-header">
						<span class="chart-title">${__("Demo Feedback Score Trend")}</span>
						${this._period_html("chart-feedback")}
					</div>
					<div class="chart-body" id="chart-feedback"></div>
				</div>
			</div>

			<!-- Charts Row 3 -->
			<div class="charts-row charts-row-single">
				<div class="chart-card">
					<div class="chart-header">
						<span class="chart-title">${__("Joining → Ready TAT per Employee")}</span>
						${this._period_html("chart-ready")}
					</div>
					<div class="chart-body" id="chart-ready"></div>
				</div>
			</div>

		</div>
		`);
	}

	// ── Refresh ──────────────────────────────────────────────────────────────

	refresh() {
		this._set_loading(true);
		Promise.all(CHART_IDS.map((id) => this._fetch_chart(id)))
			.catch((err) => {
				console.error("Sales Metrics error:", err);
				frappe.msgprint(__("Error loading metrics. Check console."));
			})
			.finally(() => this._set_loading(false));
	}

	// ── Per-Chart Fetch ──────────────────────────────────────────────────────

	_fetch_chart(chart_id) {
		const { from_date, to_date } = this._dates_for(chart_id);

		const METHOD_MAP = {
			"chart-tat":        "get_sales_to_impl_tat_data",
			"chart-sla":        "get_lead_sla_data",
			"chart-conversion": "get_conversion_rate_data",
			"chart-feedback":   "get_demo_feedback_data",
			"chart-ready":      "get_joining_ready_tat_data",
		};

		const method = METHOD_MAP[chart_id];
		if (!method) return Promise.resolve();

		return this._call(method, { from_date, to_date })
			.then((d) => this._update(chart_id, d));
	}

	// ── KPI + Chart Update Router ────────────────────────────────────────────

	_update(chart_id, data) {
		const kpi = data.kpi || {};
		const chart = data.chart || {};

		switch (chart_id) {
			case "chart-tat":
				return this._update_tat(kpi, chart);
			case "chart-sla":
				return this._update_sla(kpi, chart);
			case "chart-conversion":
				return this._update_conversion(kpi, chart);
			case "chart-feedback":
				return this._update_feedback(kpi, chart);
			case "chart-ready":
				return this._update_ready(kpi, chart);
		}
	}

	// ── 1. Sales → Impl TAT ─────────────────────────────────────────────────

	_update_tat(kpi, chart) {
		const val   = flt(kpi.value, 1);
		const color = val > 14 ? "red" : val > 7 ? "orange" : "green";

		this._set_kpi("kpi-tat-val", val + " " + __("days"));
		this._set_kpi("kpi-tat-sub", `${kpi.total_deals || 0} deals | Target: 7 days`);
		this._set_badge("kpi-tat-badge",
			val > 14 ? __("Delayed") : val > 7 ? __("Watch") : __("On Track"), color);

		if (!chart.labels?.length) { this._show_empty("chart-tat"); return; }
		this._render_bar("chart-tat", {
			categories: chart.labels,
			values:     chart.values,
			seriesName: __("TAT (days)"),
			color:      "#F97316",
			yLabel:     __("Days"),
			markLine:   { value: 7, label: "7-day target", color: "#EF4444" },
		});
	}

	// ── 2. Lead Response SLA ─────────────────────────────────────────────────

	_update_sla(kpi, chart) {
		console.log("SLA KPI:", kpi);
		console.log("SLA Chart:", chart);
		const val   = flt(kpi.value, 1);
		const color = val >= 90 ? "green" : val >= 75 ? "orange" : "red";

		this._set_kpi("kpi-sla-val", val + "%");
		this._set_kpi("kpi-sla-sub", `${kpi.within_sla || 0} / ${kpi.total_leads || 0} within 24h`);
		this._set_badge("kpi-sla-badge",
			val >= 90 ? __("On Track") : val >= 75 ? __("Watch") : __("Needs Action"), color);

		if (!chart.months?.length) { this._show_empty("chart-sla"); return; }
		this._render_line("chart-sla", {
			categories: chart.months,
			values:     chart.values,
			seriesName: __("SLA %"),
			color:      "#3B82F6",
			yMin: 0, yMax: 100,
			yLabel:     "%",
			markLine:   { value: 90, label: "90% Target", color: "#10B981" },
		});
	}

	// ── 3. Conversion Rate ───────────────────────────────────────────────────

	_update_conversion(kpi, chart) {
		const val   = flt(kpi.value, 1);
		const color = val >= 70 ? "green" : val >= 50 ? "orange" : "red";

		this._set_kpi("kpi-conv-val", val + "%");
		this._set_kpi("kpi-conv-sub", `${kpi.total_won || 0} won / ${kpi.total_closed || 0} closed`);
		this._set_badge("kpi-conv-badge",
			val >= 70 ? __("Strong") : val >= 50 ? __("Moderate") : __("Low"), color);

		if (!chart.months?.length) { this._show_empty("chart-conversion"); return; }
		this._render_line("chart-conversion", {
			categories: chart.months,
			values:     chart.values,
			seriesName: __("Conversion %"),
			color:      "#10B981",
			yMin: 0, yMax: 100,
			yLabel:     "%",
			markLine:   { value: 70, label: "70% Target", color: "#10B981" },
		});
	}

	// ── 4. Demo Feedback Score ───────────────────────────────────────────────

	_update_feedback(kpi, chart) {
		const val   = flt(kpi.value, 2);
		const color = val >= 4 ? "green" : val >= 3 ? "orange" : "red";

		this._set_kpi("kpi-fb-val", val + " / 5");
		this._set_kpi("kpi-fb-sub", `${kpi.total_responses || 0} responses`);
		this._set_badge("kpi-fb-badge",
			val >= 4 ? __("Excellent") : val >= 3 ? __("Good") : __("Needs RCA"), color);

		if (!chart.months?.length) { this._show_empty("chart-feedback"); return; }
		this._render_line("chart-feedback", {
			categories: chart.months,
			values:     chart.values,
			seriesName: __("Avg Score"),
			color:      "#8B5CF6",
			yMin: 0, yMax: 5,
			yLabel:     __("Score"),
			markLine:   { value: 4, label: "Target (4.0)", color: "#10B981" },
		});
	}

	// ── 5. Joining → Ready TAT ───────────────────────────────────────────────

	_update_ready(kpi, chart) {
		const val   = flt(kpi.value, 1);
		const color = val > 60 ? "red" : val > 45 ? "orange" : "green";

		this._set_kpi("kpi-ready-val", val + " " + __("days"));
		this._set_kpi("kpi-ready-sub", `${kpi.total_employees || 0} employees | Target: 45 days`);
		this._set_badge("kpi-ready-badge",
			val > 60 ? __("Slow") : val > 45 ? __("Watch") : __("Fast"), color);

		if (!chart.employees?.length) { this._show_empty("chart-ready"); return; }
		this._render_bar("chart-ready", {
			categories: chart.employees,
			values:     chart.values,
			seriesName: __("TAT (days)"),
			color:      "#10B981",
			yLabel:     __("Days"),
			markLine:   { value: 45, label: "45-day target", color: "#EF4444" },
		});
	}

	// ── Generic Chart Renderers ──────────────────────────────────────────────

	_get_el(id) {
		return $(this.page.body).find(`#${id}`)[0];
	}

	_render_bar(id, { categories, values, seriesName, color, yLabel, markLine }) {
		if (!window.echarts) { this._show_empty(id); return; }
		const el = this._get_el(id);
		if (!el) return;

		if (this.charts[id]) { this.charts[id].dispose(); delete this.charts[id]; }
		const chart = echarts.init(el, null, { renderer: "canvas" });
		this.charts[id] = chart;

		chart.setOption({
			backgroundColor: "transparent",
			tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
			grid: { left: 48, right: 16, top: 20, bottom: 56, containLabel: false },
			xAxis: {
				type: "category", data: categories,
				axisLabel: {
					rotate: categories.length > 6 ? 35 : 0,
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
					lineStyle: { color: markLine.color || "#EF4444", type: "dashed", width: 1.5 },
					data: [{ yAxis: markLine.value, name: markLine.label }],
					label: {
						position: "insideEndTop",
						formatter: markLine.label,
						color: markLine.color || "#EF4444",
						fontSize: 10,
					},
				} : undefined,
			}],
		});
	}

	_render_line(id, { categories, values, seriesName, color, yMin, yMax, yLabel, markLine }) {
		if (!window.echarts) { this._show_empty(id); return; }
		const el = this._get_el(id);
		if (!el) return;

		if (this.charts[id]) { this.charts[id].dispose(); delete this.charts[id]; }
		const chart = echarts.init(el, null, { renderer: "canvas" });
		this.charts[id] = chart;

		chart.setOption({
			backgroundColor: "transparent",
			tooltip: { trigger: "axis" },
			grid: { left: 48, right: 16, top: 20, bottom: 56, containLabel: false },
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
					lineStyle: { color: markLine.color || "#10B981", type: "dashed", width: 1.5 },
					data: [{ yAxis: markLine.value, name: markLine.label }],
					label: {
						position: "insideEndTop",
						formatter: markLine.label,
						color: markLine.color || "#10B981",
						fontSize: 10,
					},
				} : undefined,
			}],
		});
	}

	// ── Helpers ───────────────────────────────────────────────────────────────

	_call(method, args) {
		return new Promise((resolve, reject) => {
			frappe.call({
				method: `dv_insights.api.sales_metrics.${method}`,
				args,
				callback: (r) => resolve(r?.message || { kpi: {}, chart: {} }),
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
		const el = this._get_el(id);
		if (el) el.innerHTML = `<div class="chart-empty">${__("No data for selected period")}</div>`;
	}

	_set_loading(loading) {
		const el = $(this.page.body).find(".sales-dashboard")[0];
		if (el) el.classList.toggle("loading", loading);
	}

	// ── Styles ────────────────────────────────────────────────────────────────

	_inject_styles() {
		if (document.getElementById("sales-metrics-styles")) return;
		const style = document.createElement("style");
		style.id = "sales-metrics-styles";
		style.textContent = `
			.sales-dashboard {
				padding: 20px 24px 40px;
				transition: opacity 0.2s ease;
			}
			.sales-dashboard.loading { opacity: 0.4; pointer-events: none; }

			/* KPI Row — 5 columns */
			.kpi-row-5 {
				display: grid;
				grid-template-columns: repeat(5, 1fr);
				gap: 14px;
				margin-bottom: 24px;
			}
			@media (max-width: 1200px) { .kpi-row-5 { grid-template-columns: repeat(3, 1fr); } }
			@media (max-width: 800px)  { .kpi-row-5 { grid-template-columns: repeat(2, 1fr); } }
			@media (max-width: 520px)  { .kpi-row-5 { grid-template-columns: 1fr; } }

			.kpi-card {
				background: var(--card-bg);
				border: 1px solid var(--border-color);
				border-radius: 10px;
				padding: 16px 18px 12px;
				display: flex;
				align-items: flex-start;
				gap: 12px;
				position: relative;
				transition: box-shadow 0.18s ease;
			}
			.kpi-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.08); }
			.kpi-icon { font-size: 24px; line-height: 1; margin-top: 2px; flex-shrink: 0; }
			.kpi-body { flex: 1; min-width: 0; }
			.kpi-label {
				font-size: 10.5px; font-weight: 600;
				text-transform: uppercase; letter-spacing: 0.04em;
				color: var(--text-muted); margin-bottom: 4px;
			}
			.kpi-value {
				font-size: 24px; font-weight: 700;
				color: var(--text-color); line-height: 1.1; margin-bottom: 3px;
			}
			.kpi-sub { font-size: 10.5px; color: var(--text-muted); }
			.kpi-badge {
				position: absolute; top: 10px; right: 10px;
				font-size: 9px; font-weight: 600;
				padding: 2px 7px; border-radius: 20px;
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
			.charts-row-single {
				grid-template-columns: 1fr;
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
				color: var(--text-color); padding-top: 4px;
			}

			/* Period Controls */
			.period-controls {
				display: flex; flex-direction: column;
				align-items: flex-end; gap: 6px;
			}
			.period-selector {
				display: flex; gap: 2px;
				background: var(--control-bg);
				border: 1px solid var(--border-color);
				border-radius: 6px; padding: 2px;
			}
			.period-btn {
				background: transparent; border: none; border-radius: 4px;
				padding: 3px 9px; font-size: 11px; font-weight: 500;
				color: var(--text-muted); cursor: pointer;
				transition: background 0.15s, color 0.15s; line-height: 1.4;
			}
			.period-btn:hover { background: var(--fg-hover-color); color: var(--text-color); }
			.period-btn.active {
				background: var(--card-bg); color: var(--text-color);
				font-weight: 600; box-shadow: 0 1px 3px rgba(0,0,0,0.1);
			}

			/* Custom Date Row */
			.custom-date-row {
				display: flex; align-items: center; gap: 6px; flex-wrap: nowrap;
			}
			.custom-date-row .cdr-from .frappe-control,
			.custom-date-row .cdr-to .frappe-control {
				margin: 0 !important; padding: 0 !important;
			}
			.custom-date-row .cdr-from .frappe-control .like-disabled-input,
			.custom-date-row .cdr-to .frappe-control .like-disabled-input {
				display: none !important;
			}
			.custom-date-row .cdr-from input,
			.custom-date-row .cdr-to input {
				width: 110px !important; height: 26px !important;
				padding: 2px 8px !important; font-size: 11px !important;
				border: 1px solid var(--border-color) !important;
				border-radius: 4px !important;
				background: var(--control-bg) !important;
				color: var(--text-color) !important;
			}
			.custom-date-row .cdr-from input:focus,
			.custom-date-row .cdr-to input:focus {
				border-color: var(--primary) !important; outline: none !important;
				box-shadow: 0 0 0 2px rgba(44,120,220,0.15) !important;
			}
			.custom-date-sep { font-size: 12px; color: var(--text-muted); flex-shrink: 0; }
			.custom-date-apply {
				height: 26px; padding: 2px 12px; font-size: 11px;
				font-weight: 600; border-radius: 4px; white-space: nowrap;
			}
			.datepicker { z-index: 1050 !important; }

			.chart-body { height: 280px; width: 100%; }
			.chart-empty {
				height: 280px; display: flex;
				align-items: center; justify-content: center;
				color: var(--text-muted); font-size: 13px;
			}
		`;
		document.head.appendChild(style);
	}

	destroy() {
		$(window).off("resize.sales_metrics");
		Object.values(this.charts).forEach((c) => c.dispose?.());
		this.charts = {};
	}
}