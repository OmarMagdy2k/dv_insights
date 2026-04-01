import frappe
from frappe import _


# ── Generate Default Templates ────────────────────────────────────────────────


@frappe.whitelist()
def generate_default_templates():
	"""Generate default templates using departments from Training Configuration."""
	config = frappe.get_single("Training Configuration")
	departments = [row.department_name for row in config.departments] if config.departments else []

	if not departments:
		frappe.throw(_("Please add departments in Training Configuration first."))

	items_map = _get_default_items_map()
	created = []

	for dept in departments:
		dept_lower = (dept or "").lower()

		# Match department to item set
		if any(kw in dept_lower for kw in ("dev", "software", "engineer", "tech")):
			tpl_name = f"Developer Onboarding - {dept}"
			items = items_map["developer"]
		elif any(kw in dept_lower for kw in ("sale", "selling")):
			tpl_name = f"Sales Onboarding - {dept}"
			items = items_map["sales"]
		elif any(kw in dept_lower for kw in ("market",)):
			tpl_name = f"Marketing Onboarding - {dept}"
			items = items_map["marketing"]
		else:
			tpl_name = f"Implementation Onboarding - {dept}"
			items = items_map["implementation"]

		if frappe.db.exists("Training Template", {"template_name": tpl_name}):
			continue

		doc = frappe.new_doc("Training Template")
		doc.template_name = tpl_name
		doc.department = dept
		doc.is_default = 1
		doc.description = f"Default training template for {dept} department."

		for item in items:
			doc.append("items", item)

		doc.insert(ignore_permissions=True)
		created.append(tpl_name)

	if created:
		frappe.msgprint(
			f"Created {len(created)} template(s):<br>{'<br>'.join(created)}",
			title="Default Templates Generated",
			indicator="green",
		)
	else:
		frappe.msgprint(
			"All default templates already exist.",
			title="No Templates Created",
			indicator="blue",
		)


def _get_default_items_map():
	return {
		"developer": [
			{"subject": "Python Fundamentals", "description": "Variables, data types, control flow, functions, OOP, modules, error handling.", "expected_minutes": 120, "passing_score": 60},
			{"subject": "JavaScript Fundamentals", "description": "ES6+ syntax, DOM manipulation, async/await, Promises, event handling.", "expected_minutes": 120, "passing_score": 60},
			{"subject": "HTML & CSS", "description": "Semantic HTML, CSS layout (Flexbox, Grid), responsive design, CSS variables.", "expected_minutes": 90, "passing_score": 60},
			{"subject": "Jinja Templating", "description": "Jinja2 syntax, filters, macros, template inheritance, using Jinja in Frappe print formats.", "expected_minutes": 60, "passing_score": 60},
			{"subject": "Frappe Framework - Basics", "description": "Bench setup, app structure, DocTypes, naming rules, hooks, fixtures.", "expected_minutes": 90, "passing_score": 60},
			{"subject": "Frappe Framework - DocType Creation", "description": "Create a DocType from scratch with fields, permissions, controller logic, and client script.", "expected_minutes": 120, "passing_score": 70},
			{"subject": "Frappe Framework - Server Side", "description": "Whitelisted APIs, document hooks (validate, before_save, on_submit), ORM queries, background jobs.", "expected_minutes": 120, "passing_score": 70},
			{"subject": "Frappe Framework - Client Side", "description": "Form scripts, list/report customization, frappe.call, frappe.ui dialogs, realtime events.", "expected_minutes": 120, "passing_score": 70},
			{"subject": "Frappe Framework - Print Formats & Reports", "description": "Jinja print formats, Script Reports, Query Reports, page-level CSS.", "expected_minutes": 90, "passing_score": 60},
			{"subject": "Git & Deployment", "description": "Git workflow, branching, bench migrate, Frappe Cloud deployment basics.", "expected_minutes": 60, "passing_score": 60},
		],
		"implementation": [
			{"subject": "ERPNext Overview & Navigation", "description": "Desk navigation, search, filters, list views, workspace customization, user settings.", "expected_minutes": 60, "passing_score": 60},
			{"subject": "Setup Wizard & Company Configuration", "description": "Company creation, chart of accounts, fiscal year, currency, letterhead, print settings.", "expected_minutes": 90, "passing_score": 60},
			{"subject": "Selling Module", "description": "Customer, Quotation, Sales Order, Delivery Note, Sales Invoice full cycle.", "expected_minutes": 120, "passing_score": 70},
			{"subject": "Buying Module", "description": "Supplier, Purchase Order, Purchase Receipt, Purchase Invoice full cycle.", "expected_minutes": 120, "passing_score": 70},
			{"subject": "Stock / Inventory Module", "description": "Warehouse, Item, Stock Entry, Stock Reconciliation, batch/serial no.", "expected_minutes": 120, "passing_score": 70},
			{"subject": "Accounting Module", "description": "Journal Entry, Payment Entry, bank reconciliation, GL Entry, trial balance.", "expected_minutes": 120, "passing_score": 70},
			{"subject": "HR & Payroll Module", "description": "Employee, attendance, leave, salary structure, salary slip, payroll entry.", "expected_minutes": 120, "passing_score": 60},
			{"subject": "Data Import & Migration", "description": "Data Import Tool, CSV preparation, common errors, bulk update.", "expected_minutes": 60, "passing_score": 60},
			{"subject": "Customization Without Code", "description": "Custom fields, property setter, client scripts, server scripts, custom print formats.", "expected_minutes": 90, "passing_score": 60},
			{"subject": "UAT & Go-Live Process", "description": "Test planning, sign-off workflow, go-live checklist, post-go-live support.", "expected_minutes": 60, "passing_score": 60},
		],
		"sales": [
			{"subject": "ERPNext Selling Module - Full Cycle", "description": "Customer master, Quotation, Sales Order, Delivery Note, Sales Invoice, payment collection workflow.", "expected_minutes": 120, "passing_score": 70},
			{"subject": "CRM Module", "description": "Lead, Opportunity, pipeline stages, conversion to Customer/Quotation, activity tracking.", "expected_minutes": 90, "passing_score": 60},
			{"subject": "Pricing & Discount Rules", "description": "Price Lists, Pricing Rules, discount types, promotional schemes, coupon codes.", "expected_minutes": 60, "passing_score": 60},
			{"subject": "Customer Relationship Management", "description": "Customer groups, territory management, credit limits, loyalty programs, customer portal.", "expected_minutes": 90, "passing_score": 60},
			{"subject": "Sales Reports & Analytics", "description": "Sales Analytics, Gross Profit, Sales Funnel, Ordered vs Billed, custom Script Reports.", "expected_minutes": 60, "passing_score": 60},
			{"subject": "Quotation & Proposal Best Practices", "description": "Print format design, terms & conditions, cover letters, follow-up workflows.", "expected_minutes": 60, "passing_score": 60},
			{"subject": "Stock & Inventory for Sales Teams", "description": "Checking stock availability, reserved qty, projected qty, batch/serial selection in orders.", "expected_minutes": 60, "passing_score": 60},
			{"subject": "Payment Entry & Outstanding Management", "description": "Payment Entry creation, allocation against invoices, Accounts Receivable report, dunning.", "expected_minutes": 90, "passing_score": 60},
			{"subject": "After-Sales & Returns", "description": "Sales Return (Credit Note), warranty claims, issue tracking, customer complaints.", "expected_minutes": 60, "passing_score": 60},
			{"subject": "Communication & Follow-up Tools", "description": "Email integration, auto-email reports, assignment rules, to-do, calendar events.", "expected_minutes": 60, "passing_score": 60},
		],
		"marketing": [
			{"subject": "ERPNext CRM for Marketing", "description": "Lead sources, campaigns, lead scoring, bulk import, lead lifecycle management.", "expected_minutes": 90, "passing_score": 60},
			{"subject": "Campaign Management", "description": "Campaign DocType, linking to leads/opportunities, tracking ROI, campaign scheduling.", "expected_minutes": 60, "passing_score": 60},
			{"subject": "Email Marketing & Newsletters", "description": "Email Group, Newsletter, email templates, scheduling, unsubscribe handling, deliverability.", "expected_minutes": 90, "passing_score": 60},
			{"subject": "Social Media & Content Workflow", "description": "Content planning, approval workflows, brand guidelines, asset management in ERPNext.", "expected_minutes": 60, "passing_score": 60},
			{"subject": "Website Module", "description": "Web Page, Blog Post, Landing Page, SEO settings, forms, custom CSS in ERPNext website.", "expected_minutes": 90, "passing_score": 60},
			{"subject": "Lead Nurturing & Scoring", "description": "Auto-assignment rules, lead qualification criteria, nurturing sequences, handoff to sales.", "expected_minutes": 60, "passing_score": 60},
			{"subject": "Marketing Reports & KPIs", "description": "Campaign effectiveness, lead conversion rates, source analysis, cost per acquisition.", "expected_minutes": 60, "passing_score": 60},
			{"subject": "Event Management", "description": "Event DocType, invitations, RSVP tracking, webinar integration, post-event follow-up.", "expected_minutes": 60, "passing_score": 60},
			{"subject": "Brand & Print Materials", "description": "Letterhead, print formats, brand consistency, brochure/catalog data preparation.", "expected_minutes": 60, "passing_score": 60},
			{"subject": "Data Analysis & Segmentation", "description": "Customer segmentation, data import/export, filters, custom reports for market analysis.", "expected_minutes": 60, "passing_score": 60},
		],
	}


# ── Training Assignment on_update Hook ────────────────────────────────────────


def training_assignment_on_update(doc, method=None):
	if doc.status != "Completed":
		return

	prev = doc.get_doc_before_save()
	if prev and prev.status == "Completed":
		return

	if not doc.team_leader:
		return

	team_leader_user = frappe.db.get_value("Employee", doc.team_leader, "user_id")
	if not team_leader_user:
		return

	notification = frappe.new_doc("Notification Log")
	notification.for_user = team_leader_user
	notification.from_user = frappe.session.user
	notification.document_type = "Training Assignment"
	notification.document_name = doc.name
	notification.subject = _(
		"Training Completed: {0} ({1}) has completed all assessments in {2}"
	).format(doc.employee_name or doc.employee, doc.department, doc.template)
	notification.type = "Alert"
	notification.insert(ignore_permissions=True)
