import frappe
from frappe.utils import add_days, get_datetime
from datetime import timedelta
import random


def execute():
    generate_dummy_training_assignments()
    # generate_dummy_first_response()
    generate_dummy_project_dates()
    generate_dummy_deal_handover()


def generate_dummy_training_assignments():
    """
    bench --site <site> execute dv_insights.setup.setup_training_data.generate_dummy_training_assignments
    """

    dept_template_map = {
        ("dev", "software", "engineer", "tech"): "Developer Onboarding",
        ("implementation", "impl"): "Implementation Onboarding",
        ("sale", "selling"): "Sales Onboarding",
        ("market",): "Marketing Onboarding",
    }

    employees = frappe.get_all(
        "Employee",
        filters={"status": "Active"},
        fields=["name", "employee_name", "designation", "department", "date_of_joining"],
    )

    created = 0
    skipped = 0

    for emp in employees:
        dept = emp.department or ""
        dept_lower = dept.lower()

        template_prefix = None
        for keywords, prefix in dept_template_map.items():
            if any(kw in dept_lower for kw in keywords):
                template_prefix = prefix
                break

        if not template_prefix:
            skipped += 1
            continue

        template_name = frappe.db.get_value(
            "Training Template",
            {"template_name": ("like", f"{template_prefix}%"), "department": dept},
            "name",
        )

        if not template_name:
            skipped += 1
            continue

        if frappe.db.exists("Training Assignment", {"employee": emp.name, "template": template_name}):
            skipped += 1
            continue

        template_doc = frappe.get_doc("Training Template", template_name)
        joining = emp.date_of_joining or "2026-01-01"
        assignment_date = add_days(joining, 1)

        completion_days = random.randint(2, 7)
        completion_date = add_days(assignment_date, completion_days)

        team_leader = frappe.db.get_value(
            "Employee",
            {"department": dept, "status": "Active", "name": ("!=", emp.name)},
            "name",
            order_by="creation asc",
        )

        doc = frappe.new_doc("Training Assignment")
        doc.employee = emp.name
        doc.employee_name = emp.employee_name
        doc.designation = emp.designation
        doc.department = emp.department
        doc.template = template_name
        doc.assignment_date = assignment_date
        doc.status = "Completed"
        doc.actual_completion_date = completion_date

        if team_leader:
            doc.team_leader = team_leader
            doc.team_leader_name = frappe.db.get_value("Employee", team_leader, "employee_name")

        total_expected = 0
        total_actual = 0
        scores = []

        items_count = len(template_doc.items)
        day_step = completion_days / items_count if items_count else 1

        for idx, item in enumerate(template_doc.items):
            passing = item.passing_score or 60
            total_expected += item.expected_minutes or 0

            roll = random.random()
            if roll < 0.30:
                score = random.randint(passing, min(passing + 10, 100))
            elif roll < 0.80:
                score = random.randint(passing + 5, min(passing + 25, 100))
            else:
                score = random.randint(90, 100)

            base_offset = day_step * idx
            jitter = random.uniform(-0.2, 0.3) * day_step
            day_offset = max(0, min(base_offset + jitter, completion_days))
            start_dt = get_datetime(assignment_date) + timedelta(days=day_offset)

            actual_min = round(item.expected_minutes * random.uniform(0.5, 1.5), 1)
            end_dt = start_dt + timedelta(minutes=actual_min)

            total_actual += actual_min
            scores.append(score)

            doc.append("assessments", {
                "subject": item.subject,
                "description": item.description,
                "expected_minutes": item.expected_minutes,
                "passing_score": passing,
                "status": "Completed",
                "actual_minutes": actual_min,
                "start_time": start_dt,
                "end_time": end_dt,
                "score": score,
            })

        doc.total_expected_minutes = total_expected
        doc.total_actual_minutes = round(total_actual, 1)
        doc.progress_percentage = 100
        doc.overall_score = round(sum(scores) / len(scores), 1) if scores else 0

        doc.insert(ignore_permissions=True)
        frappe.db.set_value("Training Assignment", doc.name, "creation", assignment_date, update_modified=False)
        created += 1

    frappe.db.commit()
    print(f"Created: {created}, Skipped: {skipped}")


def generate_dummy_first_response():
    """
    bench --site <site> execute dv_insights.setup.setup_training_data.generate_dummy_first_response
    """

    leads = frappe.get_all(
        "CRM Lead",
        filters={"first_responded_on": ("is", "not set")},
        fields=["name", "creation"],
    )

    updated = 0

    for lead in leads:
        random_seconds = random.randint(300, 21600)  # 5 min to 6 hours
        creation_dt = get_datetime(lead.creation)
        responded_on = creation_dt + timedelta(seconds=random_seconds)

        frappe.db.set_value("CRM Lead", lead.name, {
            "first_responded_on": responded_on,
            "first_response_time": random_seconds,
        }, update_modified=False)

        updated += 1

    frappe.db.commit()
    print(f"Updated: {updated} leads")


def generate_dummy_project_dates():
    """
    bench --site <site> execute dv_insights.setup.setup_training_data.generate_dummy_project_dates
    """

    projects = frappe.get_all(
        "Project",
        fields=["name", "creation", "status"],
    )

    updated = 0

    for project in projects:
        creation_dt = get_datetime(project.creation).date()

        expected_duration_days = random.randint(180, 365)

        expected_start = add_days(creation_dt, random.randint(0, 7))
        expected_end = add_days(expected_start, expected_duration_days)

        # 90–95% of projects stay within expected period
        within_bounds = random.random() < 0.93

        if within_bounds:
            # Actual start: 0–5 days after expected start (never before)
            actual_start = add_days(expected_start, random.randint(0, 5))

            if project.status == "Completed":
                # Actual end: between 85%–100% of expected duration, never exceeds expected_end
                max_actual_days = (get_datetime(expected_end) - get_datetime(actual_start)).days
                actual_duration_days = random.randint(
                    round(max_actual_days * 0.85),
                    max_actual_days
                )
        else:
            # Actual start: may drift before or after expected
            actual_start = add_days(expected_start, random.randint(-5, 10))

            if project.status == "Completed":
                # Actual end: 95%–115% of expected, may overshoot
                actual_duration_days = min(
                    round(expected_duration_days * random.uniform(0.95, 1.15)),
                    365
                )

        values = {
            "expected_start_date": expected_start,
            "expected_end_date": expected_end,
            "actual_start_date": actual_start,
        }

        if project.status == "Completed":
            actual_end = add_days(actual_start, actual_duration_days)
            working_days = round(actual_duration_days * 0.70)
            actual_time = round(working_days * random.uniform(4, 8), 1)

            values["actual_end_date"] = actual_end
            values["actual_time"] = actual_time
            
            # Handover starts on actual_end_date or up to 2 days after
            handover_date = add_days(actual_end, random.randint(0, 2))
            # Support takes full ownership within 7 days of handover
            ownership_date = add_days(handover_date, random.randint(1, 7))
            handover_tat = (get_datetime(ownership_date) - get_datetime(handover_date)).days

            values["implementation_handover_date"] = handover_date
            values["support_ownership_date"] = ownership_date
            values["handover_tat_days"] = handover_tat

        frappe.db.set_value("Project", project.name, values, update_modified=False)
        updated += 1

    frappe.db.commit()
    print(f"Updated: {updated} projects")


def generate_dummy_deal_handover():
    """
    bench --site <site> execute dv_insights.setup.setup_training_data.generate_dummy_deal_handover
    """

    deals = frappe.get_all(
        "CRM Deal",
        filters={
            "status": "Won",
            "closed_date": ("is", "set"),
            "implementation_handover_date": ("is", "not set"),
        },
        fields=["name", "closed_date"],
    )

    updated = 0

    for deal in deals:
        handover_date = add_days(deal.closed_date, random.randint(0, 7))

        frappe.db.set_value("CRM Deal", deal.name, "implementation_handover_date", handover_date, update_modified=False)
        updated += 1

    frappe.db.commit()
    print(f"Updated: {updated} deals")