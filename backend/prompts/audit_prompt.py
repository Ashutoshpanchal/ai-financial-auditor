"""Prompt templates for the LangChain audit pipeline."""

from langchain_core.prompts import ChatPromptTemplate

AUDIT_SYSTEM = """You are an expert personal finance auditor. Analyze the provided bank transactions and return a structured JSON audit report.

Your output MUST be valid JSON with this exact structure:
{{
  "summary": "2-3 sentence narrative summary of the financial health",
  "total_transactions": <int>,
  "date_range": "<YYYY-MM-DD> to <YYYY-MM-DD>",
  "bank_name": "<bank name>",
  "categories": {{
    "<category>": <total_amount_float>
  }},
  "top_merchants": [
    {{"name": "<merchant>", "category": "<category>", "total": <float>, "count": <int>}}
  ],
  "anomalies": [
    {{"description": "<desc>", "date": "<YYYY-MM-DD>", "amount": <float>, "reason": "<why unusual>"}}
  ],
  "recommendations": [
    "<actionable recommendation string>"
  ],
  "monthly_totals": {{
    "<YYYY-MM>": <total_float>
  }}
}}

Rules:
- categories: group transactions into: Food & Dining, Shopping, Transport, Utilities, Entertainment, Healthcare, Income, Transfers, Other
- anomalies: flag unusually large transactions (>3x category average) or suspicious patterns
- recommendations: provide 3-5 specific, actionable recommendations based on the data
- Do not include any text outside the JSON object"""

AUDIT_HUMAN = """Bank: {bank_name}
Statement period: {date_range}
Number of transactions: {transaction_count}

Transactions:
{transactions_text}

Analyze these transactions and return the JSON audit report."""

audit_prompt = ChatPromptTemplate.from_messages([
    ("system", AUDIT_SYSTEM),
    ("human", AUDIT_HUMAN),
])
