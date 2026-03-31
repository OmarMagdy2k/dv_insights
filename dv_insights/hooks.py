app_name = "dv_insights"
app_title = "Dv Insights"
app_publisher = "Mohamed Selim"
app_description = "Custom Dashboards for datavalue"
app_email = "mohamed.selim@datavalue.solutions"
app_license = "mit"

# Apps
# ------------------

# required_apps = []

# Each item in the list will be shown as an app in the apps page
# add_to_apps_screen = [
# 	{
# 		"name": "dv_insights",
# 		"logo": "/assets/dv_insights/logo.png",
# 		"title": "Dv Insights",
# 		"route": "/dv_insights",
# 		"has_permission": "dv_insights.api.permission.has_app_permission"
# 	}
# ]

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/dv_insights/css/dv_insights.css"
# app_include_js = "/assets/dv_insights/js/dv_insights.js"

# include js, css files in header of web template
# web_include_css = "/assets/dv_insights/css/dv_insights.css"
# web_include_js = "/assets/dv_insights/js/dv_insights.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "dv_insights/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
# doctype_js = {"doctype" : "public/js/doctype.js"}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Svg Icons
# ------------------
# include app icons in desk
# app_include_icons = "dv_insights/public/icons.svg"

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# 	"methods": "dv_insights.utils.jinja_methods",
# 	"filters": "dv_insights.utils.jinja_filters"
# }

# Installation
# ------------

# before_install = "dv_insights.install.before_install"
# after_install = "dv_insights.install.after_install"

# Uninstallation
# ------------

# before_uninstall = "dv_insights.uninstall.before_uninstall"
# after_uninstall = "dv_insights.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "dv_insights.utils.before_app_install"
# after_app_install = "dv_insights.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "dv_insights.utils.before_app_uninstall"
# after_app_uninstall = "dv_insights.utils.after_app_uninstall"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "dv_insights.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
# 	"Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
# 	"Event": "frappe.desk.doctype.event.event.has_permission",
# }

# DocType Class
# ---------------
# Override standard doctype classes

# override_doctype_class = {
# 	"ToDo": "custom_app.overrides.CustomToDo"
# }

# Document Events
# ---------------
# Hook on document methods and events

# doc_events = {
# 	"*": {
# 		"on_update": "method",
# 		"on_cancel": "method",
# 		"on_trash": "method"
# 	}
# }

# Scheduled Tasks
# ---------------

# scheduler_events = {
# 	"all": [
# 		"dv_insights.tasks.all"
# 	],
# 	"daily": [
# 		"dv_insights.tasks.daily"
# 	],
# 	"hourly": [
# 		"dv_insights.tasks.hourly"
# 	],
# 	"weekly": [
# 		"dv_insights.tasks.weekly"
# 	],
# 	"monthly": [
# 		"dv_insights.tasks.monthly"
# 	],
# }

# Testing
# -------

# before_tests = "dv_insights.install.before_tests"

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "dv_insights.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "dv_insights.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["dv_insights.utils.before_request"]
# after_request = ["dv_insights.utils.after_request"]

# Job Events
# ----------
# before_job = ["dv_insights.utils.before_job"]
# after_job = ["dv_insights.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# 	"dv_insights.auth.validate"
# ]

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
# 	"Logging DocType Name": 30  # days to retain logs
# }

# Translation
# ------------
# List of apps whose translatable strings should be excluded from this app's translations.
# ignore_translatable_strings_from = []

