const TRAINING_API = "dv_insights.dv_insights.doctype.training_assignment.training_assignment";

frappe.ui.form.on("Training Assignment", {
	setup(frm) {
		frm._timer_interval = null;
		frm._user_employee = undefined;

		frm.set_query("template", () => {
			const filters = {};
			if (frm.doc.department) filters.department = frm.doc.department;
			return { filters };
		});
	},

	refresh(frm) {
		resolve_user_role(frm);
		apply_role_visibility(frm);
		render_progress_dashboard(frm);
		render_assessment_actions(frm);
		start_live_timer(frm);

		if (frm.doc.status === "Cancelled") {
			frm.disable_save();
		}

		if (!frm.is_new() && frm.doc.status !== "Cancelled") {
			if (!frm._is_trainee_only) {
				const unscored = (frm.doc.assessments || []).filter(
					(r) => r.status === "Completed" && !r.score
				);
				if (unscored.length) {
					frm.add_custom_button(
						__("Score Assessments ({0})", [unscored.length]),
						() => open_scoring_dialog(frm),
						__("Actions")
					);
				}
			}
			if (frm.doc.status !== "Completed") {
				frm.add_custom_button(
					__("Cancel Training"),
					() => {
						frappe.confirm(__("Cancel this training assignment?"), () => {
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

	onload(frm) {
		$(window).off("beforeunload.training_timer").on("beforeunload.training_timer", () => {
			if (frm._timer_interval) clearInterval(frm._timer_interval);
		});
	},
});

frappe.ui.form.on("Training Assessment Item", {
	score(frm) { render_progress_dashboard(frm); },
});


// ══════════════════════════════════════════════════════════════════════════════
// STANDALONE FUNCTIONS — avoids frm.trigger arg-passing bug in Frappe v15
// ══════════════════════════════════════════════════════════════════════════════


function resolve_user_role(frm) {
	if (frm.is_new()) return;

	const is_admin = frappe.user_roles.includes("System Manager");

	if (frm._user_employee !== undefined) {
		frm._is_admin = is_admin;
		frm._is_team_leader = !is_admin && frm._user_employee === frm.doc.team_leader;
		frm._is_trainee_only = !is_admin && frm._user_employee === frm.doc.employee && frm._user_employee !== frm.doc.team_leader;
		return;
	}

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
		},
	});

	frm._is_admin = is_admin;
	frm._is_team_leader = !is_admin && frm._user_employee === frm.doc.team_leader;
	frm._is_trainee_only = !is_admin && frm._user_employee === frm.doc.employee && frm._user_employee !== frm.doc.team_leader;
}


function apply_role_visibility(frm) {
	if (frm.is_new() || frm._is_admin) return;

	if (frm._is_trainee_only) {
		["expected_minutes", "score", "team_leader_remarks"].forEach((f) => {
			frm.fields_dict.assessments.grid.update_docfield_property(f, "hidden", 1);
		});
		frm.set_df_property("total_expected_minutes", "hidden", 1);
		frm.set_df_property("overall_score", "hidden", 1);
		frm.set_df_property("section_summary", "hidden", 1);
	}
}


// ── Direct API call — the core fix ──────────────────────────────────────────

function call_assessment_action(frm, method_name, row_idx) {
	console.log("Training Action:", method_name, "row:", row_idx, "doc:", frm.doc.name);

	frappe.call({
		method: TRAINING_API + "." + method_name,
		args: {
			docname: frm.doc.name,
			row_idx: parseInt(row_idx),
		},
		freeze: true,
		freeze_message: __("Please wait..."),
		callback: function (r) {
			if (!r.exc) {
				frm.reload_doc();
			}
		},
		error: function (r) {
			frappe.msgprint({
				title: __("Error"),
				message: r.message || "Something went wrong",
				indicator: "red",
			});
		},
	});
}


// ── Progress Dashboard ──────────────────────────────────────────────────────

function render_progress_dashboard(frm) {
	var $el = frm.fields_dict.progress_html ? frm.fields_dict.progress_html.$wrapper : null;
	if (!$el) return;

	if (frm.is_new() || !frm.doc.assessments || !frm.doc.assessments.length) {
		$el.html("");
		return;
	}

	var a = frm.doc.assessments;
	var total = a.length;
	var completed = a.filter(function (r) { return r.status === "Completed"; }).length;
	var in_progress = a.filter(function (r) { return r.status === "In Progress"; }).length;
	var not_started = total - completed - in_progress;
	var pct = total ? ((completed / total) * 100).toFixed(0) : 0;
	var t_exp = a.reduce(function (s, r) { return s + (r.expected_minutes || 0); }, 0);
	var t_act = a.reduce(function (s, r) { return s + (r.actual_minutes || 0); }, 0);
	var scored = a.filter(function (r) { return r.score; });
	var avg = scored.length ? (scored.reduce(function (s, r) { return s + r.score; }, 0) / scored.length).toFixed(0) : "\u2014";

	var tc = "var(--text-muted)";
	if (t_act > 0 && t_exp > 0) tc = t_act <= t_exp ? "var(--green-500)" : "var(--red-500)";

	var hide = frm._is_trainee_only;

	var time_card = hide
		? '<div class="tp-card"><div class="tp-value">' + t_act.toFixed(1) + '</div><div class="tp-sub">minutes total</div><div class="tp-label">Time Spent</div></div>'
		: '<div class="tp-card"><div class="tp-value" style="color:' + tc + '">' + t_act.toFixed(1) + '</div><div class="tp-sub">of ' + t_exp + ' min expected</div><div class="tp-label">Time Spent</div></div>';

	var score_card = hide ? "" : '<div class="tp-card"><div class="tp-value">' + avg + '</div><div class="tp-sub">' + scored.length + ' of ' + total + ' scored</div><div class="tp-label">Avg Score (%)</div></div>';

	$el.html(
		'<div class="training-progress-dashboard">' +
			'<div class="tp-cards">' +
				'<div class="tp-card">' +
					'<div class="tp-ring-wrap">' +
						'<svg viewBox="0 0 36 36" class="tp-ring">' +
							'<path class="tp-ring-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>' +
							'<path class="tp-ring-fill" stroke-dasharray="' + pct + ', 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>' +
							'<text x="18" y="20.35" class="tp-ring-text">' + pct + '%</text>' +
						'</svg>' +
					'</div>' +
					'<div class="tp-label">Completion</div>' +
				'</div>' +
				time_card + score_card +
				'<div class="tp-card">' +
					'<div class="tp-badges">' +
						'<span class="tp-badge tp-badge-green">' + completed + ' Done</span>' +
						'<span class="tp-badge tp-badge-blue">' + in_progress + ' Active</span>' +
						'<span class="tp-badge tp-badge-gray">' + not_started + ' Pending</span>' +
					'</div>' +
					'<div class="tp-label">Breakdown</div>' +
				'</div>' +
			'</div>' +
			'<div class="tp-bar-wrap">' +
				'<div class="tp-bar-track">' +
					'<div class="tp-bar-fill tp-bar-done" style="width:' + ((completed / total) * 100) + '%"></div>' +
					'<div class="tp-bar-fill tp-bar-active" style="width:' + ((in_progress / total) * 100) + '%"></div>' +
				'</div>' +
			'</div>' +
		'</div>'
	);
}


// ══════════════════════════════════════════════════════════════════════════════
// Assessment Actions Panel
// ══════════════════════════════════════════════════════════════════════════════

function render_assessment_actions(frm) {
	var $w = frm.fields_dict.assessment_actions_html ? frm.fields_dict.assessment_actions_html.$wrapper : null;
	if (!$w) return;

	if (frm.is_new() || !frm.doc.assessments || !frm.doc.assessments.length || frm.doc.status === "Cancelled") {
		$w.html("");
		return;
	}

	var is_trainee = frm._is_trainee_only || false;
	var is_tl = frm._is_team_leader || false;
	var is_admin = frm._is_admin || false;
	var can_start = is_trainee || is_admin;
	var can_reset = is_tl || is_admin;
	var active = null;

	for (var i = 0; i < frm.doc.assessments.length; i++) {
		if (frm.doc.assessments[i].status === "In Progress") {
			active = frm.doc.assessments[i];
			break;
		}
	}

	var cards = "";
	frm.doc.assessments.forEach(function (row) {
		var cls = "ta-c-pending";
		var lbl = '<span class="ta-st ta-st-gray">Not Started</span>';
		var btn = "";
		var timer = "";
		var info = "";

		if (row.status === "Completed") {
			cls = "ta-c-done";
			lbl = '<span class="ta-st ta-st-green">Completed</span>';
			info = '<span class="ta-info">' + (row.actual_minutes || 0).toFixed(1) + " min</span>";
			if (can_reset) {
				btn = '<button class="btn btn-xs btn-default ta-btn ta-reset" data-idx="' + row.idx + '">&#8635; Reset</button>';
			}
			if (row.score && !is_trainee) {
				var rc = row.result === "Pass" ? "ta-pass" : "ta-fail";
				info += ' <span class="' + rc + '">' + row.result + " (" + row.score + "%)</span>";
			}
		} else if (row.status === "In Progress") {
			cls = "ta-c-active";
			lbl = '<span class="ta-st ta-st-blue">In Progress</span>';
			timer = '<span class="ta-timer" data-start="' + row.start_time + '">00:00:00</span>';
			if (can_start) {
				btn = '<button class="btn btn-xs btn-danger ta-btn ta-stop" data-idx="' + row.idx + '">&#9632; Finshed</button>';
			}
		} else {
			// Not Started
			if (can_start) {
				if (active) {
					btn = '<button class="btn btn-xs btn-default ta-btn" disabled title="Stop the active assessment first">&#9654; Start</button>';
				} else {
					btn = '<button class="btn btn-xs btn-primary ta-btn ta-start" data-idx="' + row.idx + '">&#9654; Start</button>';
				}
			}
		}

		var exp = !is_trainee ? '<span class="ta-exp">Expected: ' + (row.expected_minutes || 0) + " min</span>" : "";
		var ref = row.reference_material
			? '<a href="' + row.reference_material + '" target="_blank" class="ta-ref">&#128206; Material</a>'
			: "";

		cards +=
			'<div class="ta-c ' + cls + '">' +
				'<div class="ta-idx">' + row.idx + "</div>" +
				'<div class="ta-body">' +
					'<div class="ta-top">' + frappe.utils.escape_html(row.subject) + " " + lbl + " " + timer + "</div>" +
					'<div class="ta-bot">' + exp + " " + info + " " + ref + "</div>" +
				"</div>" +
				'<div class="ta-act">' + btn + "</div>" +
			"</div>";
	});

	$w.html(
		'<div class="ta-panel">' + cards + "</div>" +
		"<style>" +
			".ta-panel{display:flex;flex-direction:column;gap:6px;padding:4px 0}" +
			".ta-c{display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:8px;border:1px solid var(--border-color);background:var(--card-bg);transition:all .15s}" +
			".ta-c:hover{box-shadow:0 2px 8px rgba(0,0,0,.04)}" +
			".ta-c-done{border-left:3px solid var(--green-500,#22c55e);background:var(--green-50,#f0fdf4)}" +
			".ta-c-active{border-left:3px solid var(--blue-500,#3b82f6);background:var(--blue-50,#eff6ff)}" +
			".ta-c-pending{border-left:3px solid var(--gray-300,#d1d5db)}" +
			".ta-idx{width:28px;height:28px;border-radius:50%;background:var(--gray-200);color:var(--gray-600);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0}" +
			".ta-c-done .ta-idx{background:var(--green-200,#BBF7D0);color:var(--green-700,#15803D)}" +
			".ta-c-active .ta-idx{background:var(--blue-200,#BFDBFE);color:var(--blue-700,#1D4ED8)}" +
			".ta-body{flex:1;min-width:0}" +
			".ta-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-weight:600;font-size:13px;color:var(--text-color)}" +
			".ta-bot{display:flex;align-items:center;gap:12px;margin-top:2px;flex-wrap:wrap}" +
			".ta-st{font-size:11px;font-weight:600;padding:1px 8px;border-radius:10px}" +
			".ta-st-gray{background:var(--gray-200);color:var(--gray-600)}" +
			".ta-st-blue{background:var(--blue-100,#DBEAFE);color:var(--blue-700,#1D4ED8)}" +
			".ta-st-green{background:var(--green-100,#DCFCE7);color:var(--green-700,#15803D)}" +
			".ta-exp,.ta-info{font-size:11px;color:var(--text-muted)}" +
			".ta-info{font-weight:600;color:var(--text-color)}" +
			".ta-pass{font-size:11px;font-weight:700;color:var(--green-600,#16A34A)}" +
			".ta-fail{font-size:11px;font-weight:700;color:var(--red-600,#DC2626)}" +
			".ta-ref{font-size:11px;color:var(--blue-500);text-decoration:none}" +
			".ta-ref:hover{text-decoration:underline}" +
			".ta-timer{font-family:'SF Mono','Fira Code','Courier New',monospace;font-size:14px;font-weight:700;color:var(--red-500,#EF4444);letter-spacing:.5px;animation:ta-blink 1s step-end infinite}" +
			"@keyframes ta-blink{50%{opacity:.65}}" +
			".ta-act{flex-shrink:0}" +
			".ta-btn{font-weight:600!important;padding:4px 14px!important;border-radius:6px!important;font-size:12px!important}" +
			".ta-stop{animation:ta-pulse 2s ease-in-out infinite}" +
			"@keyframes ta-pulse{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.4)}50%{box-shadow:0 0 0 6px rgba(239,68,68,0)}}" +
		"</style>"
	);

	// ── CLICK HANDLERS — bind directly to buttons after HTML is set ──

	$w.find(".ta-start").each(function () {
		var $btn = $(this);
		$btn.on("click", function (e) {
			e.preventDefault();
			e.stopPropagation();
			var idx = $btn.attr("data-idx");
			console.log("START clicked, idx=", idx);
			call_assessment_action(frm, "start_assessment", idx);
		});
	});

	$w.find(".ta-stop").each(function () {
		var $btn = $(this);
		$btn.on("click", function (e) {
			e.preventDefault();
			e.stopPropagation();
			var idx = $btn.attr("data-idx");
			console.log("STOP clicked, idx=", idx);
			call_assessment_action(frm, "stop_assessment", idx);
		});
	});

	$w.find(".ta-reset").each(function () {
		var $btn = $(this);
		$btn.on("click", function (e) {
			e.preventDefault();
			e.stopPropagation();
			var idx = $btn.attr("data-idx");
			console.log("RESET clicked, idx=", idx);
			frappe.confirm(__("Reset this assessment? Timer and status will be cleared."), function () {
				call_assessment_action(frm, "reset_assessment", idx);
			});
		});
	});
}


// ── Live Timer ──────────────────────────────────────────────────────────────

function start_live_timer(frm) {
	if (frm._timer_interval) {
		clearInterval(frm._timer_interval);
		frm._timer_interval = null;
	}

	var has_active = false;
	(frm.doc.assessments || []).forEach(function (r) {
		if (r.status === "In Progress") has_active = true;
	});
	if (!has_active) return;

	frm._timer_interval = setInterval(function () {
		var $w = frm.fields_dict.assessment_actions_html ? frm.fields_dict.assessment_actions_html.$wrapper : null;
		if (!$w) return;
		$w.find(".ta-timer").each(function () {
			var s = $(this).attr("data-start");
			if (!s) return;
			var d = moment.duration(moment().diff(moment(s)));
			var h = String(Math.floor(d.asHours())).padStart(2, "0");
			var m = String(d.minutes()).padStart(2, "0");
			var sec = String(d.seconds()).padStart(2, "0");
			$(this).text(h + ":" + m + ":" + sec);
		});
	}, 1000);
}


// ── Scoring Dialog ──────────────────────────────────────────────────────────

function open_scoring_dialog(frm) {
	var rows = (frm.doc.assessments || []).filter(function (r) {
		return r.status === "Completed" && !r.score;
	});
	if (!rows.length) {
		frappe.msgprint(__("No completed assessments pending scoring."));
		return;
	}

	var fields = [{
		fieldtype: "HTML",
		options: '<div style="margin-bottom:12px;padding:10px 14px;background:var(--blue-50);border-left:3px solid var(--blue-500);border-radius:4px;font-size:13px;">Enter scores for each completed assessment. Pass/Fail is automatic.</div>',
	}];

	rows.forEach(function (row) {
		fields.push(
			{ fieldtype: "Section Break", label: row.idx + ". " + row.subject,
			  description: "Expected: " + row.expected_minutes + " min | Actual: " + (row.actual_minutes || 0).toFixed(1) + " min" },
			{ fieldtype: "Int", fieldname: "score_" + row.idx, label: "Score (%)", "default": 0 },
			{ fieldtype: "Column Break" },
			{ fieldtype: "Small Text", fieldname: "tl_remarks_" + row.idx, label: "Team Leader Remarks" }
		);
	});

	var d = new frappe.ui.Dialog({
		title: __("Score Assessments"),
		fields: fields,
		size: "large",
		primary_action_label: __("Save Scores"),
		primary_action: function (values) {
			for (var i = 0; i < rows.length; i++) {
				var sc = values["score_" + rows[i].idx];
				if (sc < 0 || sc > 100) {
					frappe.msgprint(__("Score for {0} must be 0-100.", [rows[i].subject]));
					return;
				}
			}
			rows.forEach(function (row) {
				frappe.model.set_value(row.doctype, row.name, "score", values["score_" + row.idx] || 0);
				var rm = values["tl_remarks_" + row.idx];
				if (rm) frappe.model.set_value(row.doctype, row.name, "team_leader_remarks", rm);
			});
			d.hide();
			frm.dirty();
			frm.save().then(function () {
				frappe.show_alert({ message: __("Scores saved."), indicator: "green" });
			});
		},
	});
	d.show();
}
