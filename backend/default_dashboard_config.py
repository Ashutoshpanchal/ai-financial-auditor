"""Default dashboard configuration — defines widgets and layout created for every new user."""

from __future__ import annotations

DEFAULT_WIDGETS: list[dict] = [
    {
        "title": "Total Credits",
        "widget_type": "metric",
        "query_config": {
            "aggregation": "sum",
            "field": "credit",
            "filters": {
                "category": None,
                "bank_name": None,
                "transaction_type": "credit",
            },
            "format": "currency",
        },
    },
    {
        "title": "Total Debits",
        "widget_type": "metric",
        "query_config": {
            "aggregation": "sum",
            "field": "debit",
            "filters": {
                "category": None,
                "bank_name": None,
                "transaction_type": "debit",
            },
            "format": "currency",
        },
    },
    {
        "title": "Monthly Spend",
        "widget_type": "bar_chart",
        "query_config": {
            "aggregation": "sum",
            "field": "debit",
            "group_by": "month",
            "filters": {"category": None, "bank_name": None, "transaction_type": None},
        },
    },
    {
        "title": "Spend by Category",
        "widget_type": "pie_chart",
        "query_config": {
            "aggregation": "sum",
            "field": "debit",
            "group_by": "category",
            "filters": {"category": None, "bank_name": None, "transaction_type": None},
        },
    },
]

DEFAULT_LAYOUT: dict = {
    "cols": 3,
    "grid": [
        {"widget_index": 0, "row": 0, "col": 0, "col_span": 1},  # Total Credits
        {"widget_index": 1, "row": 0, "col": 1, "col_span": 1},  # Total Debits
        {"widget_index": 2, "row": 1, "col": 0, "col_span": 2},  # Monthly Spend (wide)
        {"widget_index": 3, "row": 1, "col": 2, "col_span": 1},  # Spend by Category
    ],
}
