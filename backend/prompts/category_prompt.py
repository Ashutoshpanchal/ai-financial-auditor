"""Prompt template for LLM-based transaction category classification."""

from langchain_core.prompts import ChatPromptTemplate

CATEGORY_SYSTEM = """You are a financial transaction categorizer. Given transaction descriptions \
and an available category hierarchy, map each description to the best parent_category, \
sub_category, and payment_method.

Payment methods allowed (exactly one): UPI, NEFT, IMPS, Net Banking, Credit Card, Debit Card, \
Cheque, Auto-debit, Cash, Salary Credit, Other.

Return a valid JSON array ONLY — no markdown fences, no extra text:
[{{"description": "...", "parent_category": "...", "sub_category": "...", "payment_method": "..."}}]

Rules:
- Use only parent/sub categories from the provided hierarchy.
- If unsure about sub_category use "Other" under the best parent.
- Never invent categories not in the list."""

CATEGORY_HUMAN = """Category hierarchy:
{category_hierarchy}

Descriptions to categorize:
{descriptions_text}"""

category_prompt = ChatPromptTemplate.from_messages(
    [
        ("system", CATEGORY_SYSTEM),
        ("human", CATEGORY_HUMAN),
    ]
)
