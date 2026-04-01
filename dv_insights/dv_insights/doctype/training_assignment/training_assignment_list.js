const TRAINING_API = "dv_insights.dv_insights.doctype.training_assignment.training_assignment";

frappe.ui.form.on("Training Assignment", {
	setup(frm) {
		frm._timer_interval = null;

		frm.set_query("template", () => {
			const filters = {};
			if (frm.doc.department) filters.department = frm.doc.department;
			return { filters };
		});
	},

	refresh(frm) {
		frm.trigger("apply_role_visibility");
		frm.trigger("render_progress_dashboard");
		frm.trigger("render_assessment_buttons");
		frm.trigger("render_row_colors");
		frm.trigger("start_live_timer");

		if (frm.doc.status === "Cancelled") {
			frm.disable_save();
		}

		if (!frm.is_new() && frm.doc.status !== "Cancelled") {
			const completed_unscored = (frm.doc.assessments || []).filter(
				(r) => r.status === "Completed" && !r.score
			);
			if (completed_unscored.length) {
				frm.add_custom_button(
					__("Score Assessments ({0})", [completed_unscored.length]),
					() => frm.trigger("open_scoring_dialog"),
					__("Actions")
				);
			}
			if (frm.doc.status !== "Completed") {
				frm.add_custom_button(
					__("Cancel Training"),
					() => {
						frappe.confirm(__("Cancel this training assignment? This cannot be undone."), () => {
							frm.set_value("status", "Cancelled");
							frm.save();
						});
					},
					__("Actions")
				);
			}
		}
	},

	department(frm) {
		if (!frm.doc.department) return;
		frappe.call({
			method: "frappe.client.get",
			args: { doctype: "Training Configuration" },
			callback(r) {
				if (r.message && r.message.departments) {
					const dept = r.message.departments.find(
						(d) => d.department_name === frm.doc.department
					);
					if (dept) frm.set_value("team_leader", dept.team_leader);
				}
			},
		});
	},

	template(frm) {
		if (!frm.doc.template || frm.doc.department) return;
		frappe.db.get_value("Training Template", frm.doc.template, "department", (r) => {
			if (r && r.department) frm.set_value("department", r.department);
		});
	},

	// ── Role-Based Visibility ───────────────────────────────────────────────

	apply_role_visibility(frm) {
		if (frm.is_new()) return;

		const is_system_manager = frappe.user_roles.includes("System Manager");
		const user_employee = frm._user_employee;

		// Determine if current user is the trainee (not team leader, not admin)
		if (is_system_manager) return; // admin sees everything

		const check_visibility = (employee_id) => {
			const is_trainee = frm.doc.employee === employee_id && frm.doc.team_leader !== employee_id;
			const is_team_leader = frm.doc.team_leader === employee_id;

			if (is_trainee) {
				// Hide fields the trainee should not see
				const hide_in_grid = ["expected_minutes", "score", "team_leader_remarks"];
				hide_in_grid.forEach((f) => {
					frm.fields_dict.assessments.grid.update_docfield_property(f, "hidden", 1);
				});
				// Hide summary fields
				frm.set_df_property("total_expected_minutes", "hidden", 1);
				frm.set_df_property("overall_score", "hidden", 1);
				// Make score-related sections collapsed
				frm.set_df_property("section_summary", "hidden", 1);
			}

			if (is_team_leader) {
				// Team leader sees everything but can't click Start/Stop
				frm._is_team_leader = true;
			}
		};

		// Get current user's employee ID
		if (frm._user_employee !== undefined) {
			check_visibility(frm._user_employee);
		} else {
			frappe.call({
				method: "frappe.client.get_value",
				args: {
					doctype: "Employee",
					filters: { user_id: frappe.session.user, status: "Active" },
					fieldname: "name",
				},
				async: false,
				callback(r) {
					frm._user_employee = r.message ? r.message.name : null;
					check_visibility(frm._user_employee);
				},
			});
		}
	},

	// ── Progress Dashboard ──────────────────────────────────────────────────

	render_progress_dashboard(frm) {
		if (frm.is_new() || !frm.doc.assessments?.length) {
			frm.fields_dict.progress_html.$wrapper.html("");
			return;
		}

		const assessments = frm.doc.assessments;
		const total = assessments.length;
		const completed = assessments.filter((r) => r.status === "Completed").length;
		const in_progress = assessments.filter((r) => r.status === "In Progress").length;
		const not_started = total - completed - in_progress;
		const progress_pct = total ? ((completed / total) * 100).toFixed(0) : 0;
		const total_expected = assessments.reduce((s, r) => s + (r.expected_minutes || 0), 0);
		const total_actual = assessments.reduce((s, r) => s + (r.actual_minutes || 0), 0);
		const scored = assessments.filter((r) => r.score);
		const avg_score = scored.length
			? (scored.reduce((s, r) => s + r.score, 0) / scored.length).toFixed(0)
			: "—";

		let time_color = "var(--text-muted)";
		if (total_actual > 0 && total_expected > 0) {
			time_color = total_actual <= total_expected ? "var(--green-500)" : "var(--red-500)";
		}

		// Trainee: hide expected time and score cards
		const is_trainee = frm._user_employee === frm.doc.employee
			&& frm._user_employee !== frm.doc.team_leader
			&& !frappe.user_roles.includes("System Manager");

		const time_card = is_trainee
			? `<div class="tp-card">
					<div class="tp-value">${total_actual.toFixed(1)}</div>
					<div class="tp-sub">minutes total</div>
					<div class="tp-label">Time Spent</div>
				</div>`
			: `<div class="tp-card">
					<div class="tp-value" style="color:${time_color}">${total_actual.toFixed(1)}</div>
					<div class="tp-sub">of ${total_expected} min expected</div>
					<div class="tp-label">Time Spent</div>
				</div>`;

		const score_card = is_trainee
			? ""
			: `<div class="tp-card">
					<div class="tp-value">${avg_score}</div>
					<div class="tp-sub">${scored.length} of ${total} scored</div>
					<div class="tp-label">Avg Score (%)</div>
				</div>`;

		frm.fields_dict.progress_html.$wrapper.html(`
			<div class="training-progress-dashboard">
				<div class="tp-cards">
					<div class="tp-card">
						<div class="tp-ring-wrap">
							<svg viewBox="0 0 36 36" class="tp-ring">
								<path class="tp-ring-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
								<path class="tp-ring-fill" stroke-dasharray="${progress_pct}, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
								<text x="18" y="20.35" class="tp-ring-text">${progress_pct}%</text>
							</svg>
						</div>
						<div class="tp-label">Completion</div>
					</div>
					${time_card}
					${score_card}
					<div class="tp-card">
						<div class="tp-badges">
							<span class="tp-badge tp-badge-green">${completed} Done</span>
							<span class="tp-badge tp-badge-blue">${in_progress} Active</span>
							<span class="tp-badge tp-badge-gray">${not_started} Pending</span>
						</div>
						<div class="tp-label">Breakdown</div>
					</div>
				</div>
				<div class="tp-bar-wrap">
					<div class="tp-bar-track">
						<div class="tp-bar-fill tp-bar-done" style="width:${(completed / total) * 100}%"></div>
						<div class="tp-bar-fill tp-bar-active" style="width:${(in_progress / total) * 100}%"></div>
					</div>
				</div>
			</div>
		`);
	},

	// ── Assessment Row Buttons ──────────────────────────────────────────────

	render_assessment_buttons(frm) {
		if (frm.is_new() || !frm.doc.assessments?.length) return;
		if (frm.doc.status === "Cancelled") return;

		// Team leader should NOT have Start/Stop buttons (only trainee does)
		const is_team_leader = frm._is_team_leader
			|| (frm._user_employee === frm.doc.team_leader && frm._user_employee !== frm.doc.employee);

		const render = () => {
			const grid = frm.fields_dict.assessments.grid;
			const $body = grid.wrapper.find(".grid-body .rows");
			if (!$body.length) return;

			// Remove old buttons
			$body.find(".training-btn-wrap").remove();

			$body.find(".row").each(function () {
				const $row = $(this);
				const idx = $row.attr("data-idx");
				if (!idx) return;

				const row_data = (frm.doc.assessments || []).find((r) => r.idx == idx);
				if (!row_data) return;

				const $data_row = $row.find(".data-row").first();
				if (!$data_row.length) return;

				let btn_html = "";

				if (!is_team_leader) {
					if (row_data.status === "Not Started") {
						btn_html = `
							<button class="btn btn-xs btn-primary start-btn" data-idx="${idx}"
								style="font-weight:600;padding:3px 12px;">
								▶ Start
							</button>`;
					} else if (row_data.status === "In Progress") {
						btn_html = `
							<button class="btn btn-xs btn-danger stop-btn" data-idx="${idx}"
								style="font-weight:600;padding:3px 12px;">
								■ Stop
							</button>
							<span class="live-timer" data-idx="${idx}" data-start="${row_data.start_time}"
								style="margin-left:6px;font-weight:700;font-size:12px;color:var(--red-500);font-family:monospace;">
							</span>`;
					}
				}

				// Reset button — visible to both trainee and team leader
				if (row_data.status === "Completed") {
					btn_html = `
						<button class="btn btn-xs btn-default reset-btn" data-idx="${idx}"
							style="padding:3px 12px;">
							↻ Reset
						</button>`;
				}

				if (btn_html) {
					$data_row.append(
						`<div class="training-btn-wrap" style="display:flex;align-items:center;padding:0 8px;flex-shrink:0;">${btn_html}</div>`
					);
				}
			});

			// Click handlers
			$body.off("click.training").on("click.training", ".start-btn", function (e) {
				e.preventDefault();
				e.stopPropagation();
				frm.trigger("assessment_start", $(this).data("idx"));
			}).on("click.training", ".stop-btn", function (e) {
				e.preventDefault();
				e.stopPropagation();
				frm.trigger("assessment_stop", $(this).data("idx"));
			}).on("click.training", ".reset-btn", function (e) {
				e.preventDefault();
				e.stopPropagation();
				frappe.confirm(__("Reset this assessment? Timer and status will be cleared."), () =>
					frm.trigger("assessment_reset", $(this).data("idx"))
				);
			});
		};

		// Try immediately, then retry after grid renders
		setTimeout(render, 500);
	},

	assessment_start(frm, idx) {
		frappe.call({
			method: `${TRAINING_API}.start_assessment`,
			args: { docname: frm.doc.name, row_idx: idx },
			freeze: true,
			freeze_message: __("Starting assessment..."),
			callback() { frm.reload_doc(); },
		});
	},

	assessment_stop(frm, idx) {
		frappe.call({
			method: `${TRAINING_API}.stop_assessment`,
			args: { docname: frm.doc.name, row_idx: idx },
			freeze: true,
			freeze_message: __("Stopping assessment..."),
			callback() { frm.reload_doc(); },
		});
	},

	assessment_reset(frm, idx) {
		frappe.call({
			method: `${TRAINING_API}.reset_assessment`,
			args: { docname: frm.doc.name, row_idx: idx },
			freeze: true,
			freeze_message: __("Resetting assessment..."),
			callback() { frm.reload_doc(); },
		});
	},

	// ── Row Colors ──────────────────────────────────────────────────────────

	render_row_colors(frm) {
		if (frm.is_new() || !frm.doc.assessments?.length) return;

		setTimeout(() => {
			const $body = frm.fields_dict.assessments.grid.wrapper.find(".grid-body .rows");
			$body.find(".row").each(function () {
				const $row = $(this);
				const idx = $row.attr("data-idx");
				if (!idx) return;
				const row_data = (frm.doc.assessments || []).find((r) => r.idx == idx);
				if (!row_data) return;

				$row.css({ "border-left": "", "background-color": "" });

				if (row_data.status === "Completed") {
					$row.css({ "border-left": "3px solid var(--green-500, #22c55e)", "background-color": "var(--green-50, #f0fdf4)" });
				} else if (row_data.status === "In Progress") {
					$row.css({ "border-left": "3px solid var(--blue-500, #3b82f6)", "background-color": "var(--blue-50, #eff6ff)" });
				} else {
					$row.css({ "border-left": "3px solid var(--gray-300, #d1d5db)" });
				}
			});
		}, 550);
	},

	// ── Live Timer ──────────────────────────────────────────────────────────

	start_live_timer(frm) {
		if (frm._timer_interval) {
			clearInterval(frm._timer_interval);
			frm._timer_interval = null;
		}

		const has_active = (frm.doc.assessments || []).some((r) => r.status === "In Progress");
		if (!has_active) return;

		frm._timer_interval = setInterval(() => {
			frm.fields_dict.assessments.grid.wrapper.find(".live-timer").each(function () {
				const start_str = $(this).data("start");
				if (!start_str) return;
				const diff = moment.duration(moment().diff(moment(start_str)));
				const h = String(Math.floor(diff.asHours())).padStart(2, "0");
				const m = String(diff.minutes()).padStart(2, "0");
				const s = String(diff.seconds()).padStart(2, "0");
				$(this).text(`${h}:${m}:${s}`);
			});
		}, 1000);
	},

	// ── Scoring Dialog ──────────────────────────────────────────────────────

	open_scoring_dialog(frm) {
		const rows = (frm.doc.assessments || []).filter((r) => r.status === "Completed" && !r.score);
		if (!rows.length) {
			frappe.msgprint(__("No completed assessments pending scoring."));
			return;
		}

		const fields = [
			{
				fieldtype: "HTML",
				options: `<div style="margin-bottom:12px;padding:10px 14px;background:var(--blue-50);
					border-left:3px solid var(--blue-500);border-radius:4px;font-size:13px;">
					Enter scores for each completed assessment. Results (Pass/Fail) are determined automatically.
				</div>`,
			},
		];

		rows.forEach((row) => {
			fields.push(
				{ fieldtype: "Section Break", label: `${row.idx}. ${row.subject}`,
				  description: `Expected: ${row.expected_minutes} min | Actual: ${(row.actual_minutes || 0).toFixed(1)} min` },
				{ fieldtype: "Int", fieldname: `score_${row.idx}`, label: "Score (%)", default: 0 },
				{ fieldtype: "Column Break" },
				{ fieldtype: "Small Text", fieldname: `tl_remarks_${row.idx}`, label: "Team Leader Remarks" }
			);
		});

		const d = new frappe.ui.Dialog({
			title: __("Score Assessments"),
			fields,
			size: "large",
			primary_action_label: __("Save Scores"),
			primary_action(values) {
				for (const row of rows) {
					const score = values[`score_${row.idx}`];
					if (score < 0 || score > 100) {
						frappe.msgprint(__("Score for <b>{0}</b> must be between 0 and 100.", [row.subject]));
						return;
					}
				}

				rows.forEach((row) => {
					frappe.model.set_value(row.doctype, row.name, "score", values[`score_${row.idx}`] || 0);
					const remarks = values[`tl_remarks_${row.idx}`];
					if (remarks) frappe.model.set_value(row.doctype, row.name, "team_leader_remarks", remarks);
				});

				d.hide();
				frm.dirty();
				frm.save().then(() => {
					frappe.show_alert({ message: __("Scores saved for {0} assessments.", [rows.length]), indicator: "green" });
				});
			},
		});
		d.show();
	},

	// ── Cleanup ─────────────────────────────────────────────────────────────

	onload(frm) {
		$(window).off("beforeunload.training_timer").on("beforeunload.training_timer", () => {
			if (frm._timer_interval) clearInterval(frm._timer_interval);
		});
	},
});

// Re-render on grid changes
frappe.ui.form.on("Training Assessment Item", {
	form_render(frm) {
		frm.trigger("render_assessment_buttons");
		frm.trigger("render_row_colors");
	},
	score(frm) {
		frm.trigger("render_progress_dashboard");
	},
});
